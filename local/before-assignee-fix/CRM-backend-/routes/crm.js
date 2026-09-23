const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const authenticateToken = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const pool = require('../config/database');
const transporter = require('../services/emailService');

// Every internal CRM endpoint requires a valid login. Public proposal links
// remain accessible through their cryptographically random proposal token.
router.use((req, res, next) => {
  if (req.path.startsWith('/public/proposals/')) return next();
  return authenticateToken(req, res, next);
});

// Role boundary for CRM: admins can access the complete module; sales and
// marketing roles can access only leads/follow-ups assigned to themselves.
router.use(async (req, res, next) => {
  if (req.path.startsWith('/public/proposals/')) return next();
  try {
    const { rows } = await pool.query('SELECT id, email, full_name, role FROM users WHERE id=$1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(403).json({ error: 'User account not found' });
    const role = String(user.role || '').toLowerCase();
    req.crmUser = user;
    req.crmIsAdmin = role === 'admin' || role === 'super admin' || role === 'superadmin';
    req.crmIsSales = role.includes('sales') || role.includes('marketing');
    if (req.crmIsAdmin) return next();
    if (!req.crmIsSales || !/^\/(leads|followups)(\/|$)/.test(req.path)) {
      return res.status(403).json({ error: 'This CRM module is available to administrators only' });
    }
    const match = req.path.match(/^\/(leads|followups)\/([^/]+)/);
    if (!match) return next();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[2])) return res.status(400).json({error:'Invalid record ID'});
    const table = match[1] === 'leads' ? 'crm_leads' : 'crm_followups';
    const condition = match[1] === 'leads'
      ? `id=$1 AND LOWER(NULLIF(assigned,'')) IN (LOWER($2),LOWER($3),$4)`
      : `id=$1 AND (assigned_user_id=$4 OR LOWER(NULLIF(assigned,'')) IN (LOWER($2),LOWER($3),$5))`;
    const params = match[1] === 'leads'
      ? [match[2], user.full_name || '', user.email, String(user.id)]
      : [match[2], user.full_name || '', user.email, user.id, String(user.id)];
    const owned = await pool.query(`SELECT id FROM ${table} WHERE ${condition}`, params);
    if (!owned.rowCount) return res.status(403).json({ error: 'You can access only records assigned to you' });
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// Validate writes before SQL or automation side effects.
router.use(async (req,res,next)=>{
 if(!['POST','PUT','PATCH'].includes(req.method)||req.path.startsWith('/public/'))return next();
 const body=req.body||{};
 if (/^\/proposals(?:\/[^/]+)?$/.test(req.path) && body.status!==undefined && !['Draft','Sent','Viewed','Accepted','Rejected','Expired'].includes(body.status)) return res.status(400).json({error:'Invalid proposal status'});
 if (/^\/customer-success\/[^/]+$/.test(req.path) && (body.currentStage||body.current_stage) && !CUSTOMER_SUCCESS_STAGES.includes(body.currentStage||body.current_stage)) return res.status(400).json({error:'Invalid customer success stage'});
 if(/^\/leads(?:\/[^/]+)?$/.test(req.path)){
  if(typeof body.name!=='string'||!body.name.trim())return res.status(400).json({error:'Lead name is required'});
  if(body.stage!==undefined&&!['New','Contacted','Qualified','Proposal','Negotiation','Won','Lost'].includes(body.stage))return res.status(400).json({error:'Invalid lead stage'});
 }
 for(const field of ['value','budget','quotationValue','estimatedValue','salesCommission','sales_commission']){
  const value=body[field];if(value!==undefined&&value!==null&&value!==''&&(!['string','number'].includes(typeof value)||!String(value).trim()||!Number.isFinite(Number(value))||Number(value)<0))return res.status(400).json({error:field+' must be a non-negative number'});
 }
 if(req.crmIsSales){
  const user=req.crmUser, identities=[user.full_name,user.email,String(user.id)].filter(Boolean).map(v=>v.toLowerCase());
  if(body.assigned&&!identities.includes(String(body.assigned).toLowerCase()))return res.status(403).json({error:'You cannot assign records to another user'});
  if((body.assignedUserId||body.assigned_user_id)&&String(body.assignedUserId||body.assigned_user_id)!==String(user.id))return res.status(403).json({error:'You cannot assign records to another user'});
  body.assigned=user.email;body.assignedUserId=String(user.id);
  if(req.path.startsWith('/followups')&&(body.lead||body.lead_name)){
   try{const {rows}=await pool.query("SELECT id FROM crm_leads WHERE name=$1 AND LOWER(NULLIF(assigned,''))=ANY($2::text[])",[body.lead||body.lead_name,identities]);if(rows.length!==1)return res.status(403).json({error:'Follow-up requires one of your assigned leads'});}catch(err){return res.status(500).json({error:'Unable to verify lead assignment'});}
  }
 }
 next();
});

let twilioFactory = null;
try {
  twilioFactory = require('twilio');
} catch (err) {
  twilioFactory = null;
}

const normalizeCallPhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return '';
};

const escapeTwiml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const ensureLeadExtraColumns = async () => {
  try {
    await pool.query(`
      ALTER TABLE crm_leads
      ADD COLUMN IF NOT EXISTS contact_type TEXT,
      ADD COLUMN IF NOT EXISTS entity_type TEXT,
      ADD COLUMN IF NOT EXISTS tax_number TEXT,
      ADD COLUMN IF NOT EXISTS address1 TEXT,
      ADD COLUMN IF NOT EXISTS address2 TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS country TEXT,
      ADD COLUMN IF NOT EXISTS zip_code TEXT,
      ADD COLUMN IF NOT EXISTS landmark TEXT,
      ADD COLUMN IF NOT EXISTS street_name TEXT,
      ADD COLUMN IF NOT EXISTS building_number TEXT,
      ADD COLUMN IF NOT EXISTS additional_number TEXT,
      ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS contact_persons JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lead_details JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS product_category TEXT,
      ADD COLUMN IF NOT EXISTS machine_type TEXT,
      ADD COLUMN IF NOT EXISTS application TEXT,
      ADD COLUMN IF NOT EXISTS requirement_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS installation_location TEXT,
      ADD COLUMN IF NOT EXISTS requirement_details TEXT,
      ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS expected_purchase_date DATE,
      ADD COLUMN IF NOT EXISTS quotation_value NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS competitor_details TEXT,
      ADD COLUMN IF NOT EXISTS next_followup_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS next_followup_activity TEXT,
      ADD COLUMN IF NOT EXISTS gps_latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS gps_longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMP
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_lead_locations (
        id SERIAL PRIMARY KEY,
        lead_id TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        capture_source TEXT NOT NULL DEFAULT 'lead_form',
        captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS crm_lead_locations_lead_id_idx ON crm_lead_locations (lead_id)`);
  } catch (err) {
    console.error('lead extra column setup failed:', err.message); throw err;
  }
};

const ensureCrmSettingsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Manod Technologies',
      currency TEXT NOT NULL DEFAULT 'INR',
      default_assigned TEXT,
      default_stage TEXT NOT NULL DEFAULT 'New',
      default_source TEXT NOT NULL DEFAULT 'Website',
      updated_by TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`INSERT INTO crm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await pool.query(`ALTER TABLE crm_settings ADD COLUMN IF NOT EXISTS crm_industry TEXT NOT NULL DEFAULT 'general'`);
};

const ensureIndustryDataColumns = async () => {
  for (const table of ['crm_leads', 'crm_followups', 'crm_proposals', 'crm_contacts', 'crm_campaigns', 'crm_payment_reminders', 'crm_customer_success', 'crm_installed_machines', 'crm_machine_consumables', 'crm_machine_replacement_opportunities']) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS crm_industry TEXT NOT NULL DEFAULT 'general'`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN crm_industry SET DEFAULT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_crm_industry_idx ON ${table} (crm_industry)`);
    await pool.query(`UPDATE ${table} SET crm_industry='general' WHERE crm_industry IS NULL OR crm_industry=''`);
    await pool.query(`DROP POLICY IF EXISTS ${table}_industry_policy ON ${table}`);
    await pool.query(`CREATE POLICY ${table}_industry_policy ON ${table}
      USING (crm_industry=(SELECT crm_industry FROM crm_settings WHERE id=1))
      WITH CHECK (crm_industry=(SELECT crm_industry FROM crm_settings WHERE id=1))`);
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  }
  await pool.query(`CREATE OR REPLACE FUNCTION crm_set_active_industry() RETURNS trigger AS $$
    BEGIN
      IF NEW.crm_industry IS NULL OR NEW.crm_industry='' THEN
        SELECT crm_industry INTO NEW.crm_industry FROM crm_settings WHERE id=1;
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`);
  for (const table of ['crm_leads', 'crm_followups', 'crm_proposals', 'crm_contacts', 'crm_campaigns', 'crm_payment_reminders', 'crm_customer_success', 'crm_installed_machines', 'crm_machine_consumables', 'crm_machine_replacement_opportunities']) {
    await pool.query(`DROP TRIGGER IF EXISTS ${table}_set_industry ON ${table}`);
    await pool.query(`CREATE TRIGGER ${table}_set_industry BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION crm_set_active_industry()`);
  }
};

const gpsNumber = value => value === null || value === undefined || String(value).trim() === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const jsonValue = (value, fallback) => JSON.stringify(value ?? fallback);
const saveLeadLocationHistory = async (leadId, body = {}) => {
  const latitude = gpsNumber(body.gpsLatitude ?? body.gps_latitude);
  const longitude = gpsNumber(body.gpsLongitude ?? body.gps_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  await pool.query(
    `INSERT INTO crm_lead_locations (lead_id, latitude, longitude, accuracy, capture_source, captured_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [String(leadId), latitude, longitude,
      Number.isFinite(Number(body.gpsAccuracy ?? body.gps_accuracy)) ? Number(body.gpsAccuracy ?? body.gps_accuracy) : null,
      body.gpsSource || body.gps_source || 'lead_form', body.gpsCapturedAt || body.gps_captured_at || new Date()]
  );
};
const ensureProposalAutomationColumns = async () => {
  await pool.query(`
    ALTER TABLE crm_proposals
      ADD COLUMN IF NOT EXISTS public_token TEXT,
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS followup_1_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS call_task_created_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS final_reminder_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS crm_proposals_public_token_idx
    ON crm_proposals (public_token)
    WHERE public_token IS NOT NULL
  `);
};

const ensureDailyDigestTable = async () => {
  await pool.query(`ALTER TABLE crm_followups ADD COLUMN IF NOT EXISTS assigned_user_id TEXT`);
  await pool.query(`
    UPDATE crm_followups f
    SET assigned_user_id=u.id::text
    FROM users u
    WHERE f.assigned_user_id IS NULL
      AND LOWER(TRIM(COALESCE(f.assigned, ''))) = LOWER(TRIM(COALESCE(u.full_name, '')))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_daily_digest_log (
      id SERIAL PRIMARY KEY,
      digest_date DATE NOT NULL,
      recipient_email TEXT NOT NULL,
      digest_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (digest_date, recipient_email, digest_type)
    )
  `);
};

const ensureExportSalesTables = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS export_vendors (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT,
    country TEXT DEFAULT 'India', categories TEXT, certification TEXT, status TEXT DEFAULT 'Active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_products (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, hs_code TEXT, specification TEXT,
    certification TEXT, currency TEXT DEFAULT 'USD', unit_price NUMERIC DEFAULT 0, unit TEXT DEFAULT 'Unit', status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_rfqs (
    id SERIAL PRIMARY KEY, reference_no TEXT UNIQUE NOT NULL, buyer_name TEXT NOT NULL, buyer_email TEXT, product_id INTEGER REFERENCES export_products(id) ON DELETE SET NULL,
    quantity NUMERIC DEFAULT 0, unit TEXT, incoterm TEXT DEFAULT 'FOB', destination_country TEXT, required_by DATE, status TEXT DEFAULT 'New', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_quotations (
    id SERIAL PRIMARY KEY, quotation_no TEXT UNIQUE NOT NULL, rfq_id INTEGER REFERENCES export_rfqs(id) ON DELETE SET NULL, buyer_name TEXT NOT NULL, buyer_email TEXT,
    currency TEXT DEFAULT 'USD', amount NUMERIC DEFAULT 0, incoterm TEXT DEFAULT 'FOB', validity_date DATE, status TEXT DEFAULT 'Draft', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_orders (
    id SERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, quotation_id INTEGER REFERENCES export_quotations(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL, buyer_email TEXT, product_summary TEXT, order_value NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
    incoterm TEXT DEFAULT 'FOB', stage TEXT DEFAULT 'Order Confirmed', production_status TEXT DEFAULT 'Not Started',
    expected_shipment DATE, container_no TEXT, destination_country TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_shipments (
    id SERIAL PRIMARY KEY, shipment_no TEXT UNIQUE NOT NULL, order_id INTEGER REFERENCES export_orders(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL, container_no TEXT, vessel_name TEXT, port_of_loading TEXT, port_of_discharge TEXT,
    etd DATE, eta DATE, status TEXT DEFAULT 'Scheduled', milestone TEXT DEFAULT 'Booking Confirmed', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_documents (
    id SERIAL PRIMARY KEY, document_no TEXT UNIQUE NOT NULL, order_id INTEGER REFERENCES export_orders(id) ON DELETE SET NULL,
    shipment_id INTEGER REFERENCES export_shipments(id) ON DELETE SET NULL, document_type TEXT NOT NULL, buyer_name TEXT,
    document_date DATE, status TEXT DEFAULT 'Draft', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_payments (
    id SERIAL PRIMARY KEY, payment_ref TEXT UNIQUE NOT NULL, order_id INTEGER REFERENCES export_orders(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL, payment_type TEXT DEFAULT 'Advance', payment_mode TEXT DEFAULT 'TT', currency TEXT DEFAULT 'USD',
    invoice_amount NUMERIC DEFAULT 0, received_amount NUMERIC DEFAULT 0, due_date DATE, received_date DATE,
    status TEXT DEFAULT 'Pending', lc_number TEXT, notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS real_estate_properties (
    id SERIAL PRIMARY KEY, project_name TEXT NOT NULL, property_name TEXT NOT NULL, property_type TEXT, location TEXT,
    price NUMERIC DEFAULT 0, status TEXT DEFAULT 'Available', bedrooms TEXT, area TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS real_estate_site_visits (
    id SERIAL PRIMARY KEY, lead_name TEXT NOT NULL, property_id INTEGER REFERENCES real_estate_properties(id) ON DELETE SET NULL,
    visit_date TIMESTAMP, status TEXT DEFAULT 'Scheduled', assigned TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS real_estate_bookings (
    id SERIAL PRIMARY KEY, booking_no TEXT UNIQUE NOT NULL, lead_name TEXT NOT NULL, property_id INTEGER REFERENCES real_estate_properties(id) ON DELETE SET NULL,
    token_amount NUMERIC DEFAULT 0, booking_date DATE, status TEXT DEFAULT 'Reserved', agreement_status TEXT DEFAULT 'Pending', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS real_estate_payments (
    id SERIAL PRIMARY KEY, receipt_no TEXT UNIQUE NOT NULL, booking_id INTEGER REFERENCES real_estate_bookings(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL, installment_name TEXT, amount_due NUMERIC DEFAULT 0, amount_received NUMERIC DEFAULT 0,
    due_date DATE, received_date DATE, status TEXT DEFAULT 'Pending', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS real_estate_brokers (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT, phone TEXT, email TEXT, commission_percent NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Active', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_purchase_enquiries (
    id SERIAL PRIMARY KEY, enquiry_no TEXT UNIQUE NOT NULL, vendor_id INTEGER REFERENCES export_vendors(id) ON DELETE SET NULL,
    vendor_name TEXT NOT NULL, product_name TEXT NOT NULL, quantity NUMERIC DEFAULT 0, unit TEXT, required_by DATE,
    status TEXT DEFAULT 'Open', quoted_price NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_inventory (
    id SERIAL PRIMARY KEY, product_name TEXT NOT NULL, sku TEXT, warehouse TEXT, batch_no TEXT, quantity NUMERIC DEFAULT 0,
    reserved_quantity NUMERIC DEFAULT 0, reorder_level NUMERIC DEFAULT 0, unit TEXT DEFAULT 'Unit', status TEXT DEFAULT 'Available', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS export_packing_dispatch (
    id SERIAL PRIMARY KEY, dispatch_no TEXT UNIQUE NOT NULL, order_id INTEGER REFERENCES export_orders(id) ON DELETE SET NULL,
    buyer_name TEXT, packing_status TEXT DEFAULT 'Not Started', package_count INTEGER DEFAULT 0, gross_weight NUMERIC DEFAULT 0,
    dispatch_date DATE, status TEXT DEFAULT 'Planned', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
};

const ensureMachineServiceTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_installed_machines (
      id SERIAL PRIMARY KEY,
      lead_id TEXT,
      customer_name TEXT NOT NULL,
      machine_model TEXT NOT NULL,
      serial_number TEXT UNIQUE,
      installation_date DATE,
      warranty_start DATE,
      warranty_end DATE,
      next_maintenance DATE,
      spare_requirement TEXT,
      amc_status TEXT DEFAULT 'Not Applicable',
      amc_start DATE,
      amc_end DATE,
      location TEXT,
      assigned_user_id TEXT,
      assigned TEXT,
      status TEXT DEFAULT 'Active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_machine_services (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER NOT NULL REFERENCES crm_installed_machines(id) ON DELETE CASCADE,
      service_date DATE NOT NULL,
      service_type TEXT DEFAULT 'Preventive Maintenance',
      issue_reported TEXT,
      work_performed TEXT,
      spare_used TEXT,
      technician TEXT,
      next_service_date DATE,
      status TEXT DEFAULT 'Completed',
      cost NUMERIC DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE crm_machine_services
      ADD COLUMN IF NOT EXISTS service_category TEXT DEFAULT 'Preventive Maintenance',
      ADD COLUMN IF NOT EXISTS assigned_technician_id TEXT,
      ADD COLUMN IF NOT EXISTS customer_contact_name TEXT,
      ADD COLUMN IF NOT EXISTS customer_contact_phone TEXT,
      ADD COLUMN IF NOT EXISTS coverage_status TEXT DEFAULT 'Chargeable',
      ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT 'Resolved',
      ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS spare_cost NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS travel_cost NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS downtime_start TIMESTAMP,
      ADD COLUMN IF NOT EXISTS downtime_end TIMESTAMP,
      ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS customer_confirmation_name TEXT,
      ADD COLUMN IF NOT EXISTS customer_feedback TEXT,
      ADD COLUMN IF NOT EXISTS customer_rating INTEGER
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_machine_service_attachments (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES crm_machine_services(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_data BYTEA NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_machine_consumables (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER REFERENCES crm_installed_machines(id) ON DELETE CASCADE,
      lead_id TEXT,
      customer_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT DEFAULT 'Consumable',
      quantity NUMERIC DEFAULT 0,
      unit TEXT DEFAULT 'Nos',
      reorder_level NUMERIC DEFAULT 0,
      last_supplied_date DATE,
      next_requirement_date DATE,
      unit_price NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'Active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE crm_machine_consumables
      ADD COLUMN IF NOT EXISTS sku TEXT,
      ADD COLUMN IF NOT EXISTS brand TEXT,
      ADD COLUMN IF NOT EXISTS specification TEXT,
      ADD COLUMN IF NOT EXISTS supply_type TEXT DEFAULT 'Sale',
      ADD COLUMN IF NOT EXISTS order_invoice_number TEXT,
      ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tax_percent NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_supplied_quantity NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS consumption_frequency TEXT DEFAULT 'Monthly',
      ADD COLUMN IF NOT EXISTS frequency_days INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS assigned_user_id TEXT,
      ADD COLUMN IF NOT EXISTS assigned TEXT,
      ADD COLUMN IF NOT EXISTS opportunity_status TEXT DEFAULT 'Reminder Due',
      ADD COLUMN IF NOT EXISTS customer_contact_name TEXT,
      ADD COLUMN IF NOT EXISTS customer_contact_phone TEXT
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_machine_replacement_opportunities (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER REFERENCES crm_installed_machines(id) ON DELETE SET NULL,
      lead_id TEXT,
      customer_name TEXT NOT NULL,
      current_model TEXT,
      replacement_reason TEXT,
      proposed_model TEXT,
      expected_purchase_date DATE,
      estimated_value NUMERIC DEFAULT 0,
      stage TEXT DEFAULT 'New',
      assigned_user_id TEXT,
      assigned TEXT,
      status TEXT DEFAULT 'Open',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_machine_automation_log (
      id SERIAL PRIMARY KEY,
      event_key TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (event_key, recipient_email)
    )
  `);
};

const ensureMachineServicePermissions = async () => {
  for (const name of ['View machine service', 'Add machine service', 'Edit machine service', 'Delete machine service']) {
    await pool.query(
      `INSERT INTO permissions (group_name, name)
       SELECT 'Machine Service', $1
       WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE group_name='Machine Service' AND name=$1)`,
      [name]
    );
  }
};
const CUSTOMER_SUCCESS_STAGES = [
  'Order Confirmed',
  'Invoice Generated',
  'Project Assigned',
  'Document Collection',
  'Implementation Started',
  'Training Scheduled',
  'Go Live',
  'Support',
  'Feedback Collected',
  'Upsell Opportunity',
  'AMC / Renewal Reminder',
];

const CUSTOMER_SUCCESS_PLAN = [
  { stage: 'Order Confirmed', days: 0, title: 'Confirm customer order', type: 'Call', category: 'Admin' },
  { stage: 'Invoice Generated', days: 1, title: 'Generate and send invoice', type: 'Email', category: 'Admin' },
  { stage: 'Project Assigned', days: 2, title: 'Assign project owner', type: 'Meeting', category: 'Admin' },
  { stage: 'Document Collection', days: 3, title: 'Collect customer documents', type: 'Email', category: 'Support' },
  { stage: 'Implementation Started', days: 5, title: 'Start implementation', type: 'Meeting', category: 'Technical' },
  { stage: 'Training Scheduled', days: 10, title: 'Schedule customer training', type: 'Demo', category: 'Technical' },
  { stage: 'Go Live', days: 15, title: 'Prepare go live checklist', type: 'Meeting', category: 'Technical' },
  { stage: 'Support', days: 20, title: 'Post go-live support check', type: 'Call', category: 'Support' },
  { stage: 'Feedback Collected', days: 30, title: 'Collect customer feedback', type: 'Call', category: 'Support' },
  { stage: 'Upsell Opportunity', days: 45, title: 'Review upsell opportunity', type: 'Call', category: 'Sales' },
  { stage: 'AMC / Renewal Reminder', days: 330, title: 'AMC / renewal reminder', type: 'Call', category: 'Sales' },
];


const PAYMENT_REMINDER_STAGES = [
  'Advance Payment Pending',
  'Reminder 1',
  'Reminder 2',
  'Final Reminder',
  'Payment Received',
];

const PAYMENT_REMINDER_PLAN = [
  { stage: 'Advance Payment Pending', days: 0, title: 'Collect advance payment', type: 'Email', category: 'Sales' },
  { stage: 'Reminder 1', days: 2, title: 'Payment reminder 1', type: 'Email', category: 'Sales' },
  { stage: 'Reminder 2', days: 5, title: 'Payment reminder 2', type: 'Call', category: 'Sales' },
  { stage: 'Final Reminder', days: 7, title: 'Final payment reminder', type: 'Call', category: 'Sales' },
];

const ensurePaymentReminderTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_payment_reminders (
      id SERIAL PRIMARY KEY,
      proposal_id TEXT UNIQUE,
      lead_id TEXT,
      lead_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      assigned TEXT,
      amount NUMERIC DEFAULT 0,
      current_stage TEXT NOT NULL DEFAULT 'Advance Payment Pending',
      status TEXT NOT NULL DEFAULT 'Pending',
      due_date DATE,
      paid_at TIMESTAMP,
      notes TEXT,
      stage_history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE crm_payment_reminders ADD COLUMN IF NOT EXISTS proposal_id TEXT`);
  await pool.query(`ALTER TABLE crm_payment_reminders ADD COLUMN IF NOT EXISTS lead_id TEXT`);
  await pool.query(`ALTER TABLE crm_payment_reminders ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE crm_payment_reminders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
};

const ensureCustomerSuccessTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_customer_success (
      id SERIAL PRIMARY KEY,
      lead_id TEXT,
      lead_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      assigned TEXT,
      current_stage TEXT NOT NULL DEFAULT 'Order Confirmed',
      status TEXT NOT NULL DEFAULT 'Active',
      started_at TIMESTAMP DEFAULT NOW(),
      due_date DATE,
      completed_at TIMESTAMP,
      notes TEXT,
      stage_history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (lead_name)
    )
  `);
  await pool.query(`ALTER TABLE crm_customer_success ALTER COLUMN lead_id TYPE TEXT USING lead_id::TEXT`);
};

// Reads must never delete business records. Relationships are maintained by stable lead IDs.
const cleanupOrphanLeadRecords = async () => {};
const SALES_TEAM = [
  { name: 'Er Sarath Raj', email: process.env.SALES_ER_SARATH_EMAIL || process.env.SALES_EMAIL_1 },
  { name: 'Ms Dharshiha C', email: process.env.SALES_DHARSHIHA_EMAIL || process.env.SALES_EMAIL_2 },
  { name: 'Mr Leejin', email: process.env.SALES_LEEJIN_EMAIL || process.env.SALES_EMAIL_3 },
];

const LOCATION_ASSIGNMENT = [
  { terms: ['vencode', 'colachel', 'nagercoil', 'kanyakumari'], assigned: 'Ms Dharshiha C' },
  { terms: ['chennai', 'madurai', 'coimbatore'], assigned: 'Er Sarath Raj' },
  { terms: ['trivandrum', 'kerala', 'ernakulam'], assigned: 'Mr Leejin' },
];

const PRODUCT_ASSIGNMENT = [
  { terms: ['software', 'crm', 'technology', 'website', 'app'], assigned: 'Er Sarath Raj' },
  { terms: ['industrial', 'manufacturing', 'machine', 'equipment'], assigned: 'Ms Dharshiha C' },
  { terms: ['service', 'support', 'maintenance'], assigned: 'Mr Leejin' },
];
const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date;
};

const leadNameOf = (lead) => lead?.name || lead?.lead_name || '';
const leadAssignedOf = (lead) => lead?.assigned || null;
const resolveAssignedUserId = async (assigned, assignedUserId) => {
  if (assignedUserId) {
    const { rows } = await pool.query('SELECT id::text AS id FROM users WHERE id::text=$1 LIMIT 1', [String(assignedUserId)]);
    if (rows[0]) return rows[0].id;
  }
  if (!assigned) return null;
  const { rows } = await pool.query(
    `SELECT id::text AS id FROM users WHERE LOWER(TRIM(full_name))=LOWER(TRIM($1)) LIMIT 1`,
    [assigned]
  );
  return rows[0]?.id || null;
};
const resolveLinkedLeadName = async (value) => {
  const input = String(value || '').trim();
  if (!input) return null;
  const { rows } = await pool.query(
    'SELECT name FROM crm_leads WHERE id::text=$1 OR name=$1 LIMIT 1',
    [input]
  );
  return rows[0]?.name || null;
};
const normalize = (value) => String(value || '').toLowerCase();
const salespersonEmail = (name) => SALES_TEAM.find((person) => person.name === name)?.email || process.env.SALES_DEFAULT_EMAIL || process.env.EMAIL_USER;

const matchAssignmentRule = (rules, value) => {
  const haystack = normalize(value);
  const rule = rules.find((item) => item.terms.some((term) => haystack.includes(term)));
  return rule?.assigned || null;
};

const getRoundRobinAssignee = async () => {
  const { rows } = await pool.query(
    `SELECT assigned, COUNT(*)::int AS count
     FROM crm_leads
     WHERE assigned = ANY($1)
     GROUP BY assigned`,
    [SALES_TEAM.map((person) => person.name)]
  );
  const counts = new Map(rows.map((row) => [row.assigned, row.count]));
  return SALES_TEAM
    .map((person) => ({ ...person, count: counts.get(person.name) || 0 }))
    .sort((a, b) => a.count - b.count)[0].name;
};

const resolveLeadAssignee = async (lead) => {
  return (
    matchAssignmentRule(LOCATION_ASSIGNMENT, lead.location) ||
    matchAssignmentRule(PRODUCT_ASSIGNMENT, `${lead.industry || ''} ${lead.product || ''} ${lead.notes || ''}`) ||
    await getRoundRobinAssignee()
  );
};

const optionalCompanyAttachments = () => {
  const items = [
    ['Company Profile', process.env.COMPANY_PROFILE_PATH],
    ['Brochure', process.env.BROCHURE_PATH],
    ['Product Catalog', process.env.PRODUCT_CATALOG_PATH],
  ];
  return items.filter(([, path]) => path).map(([filename, path]) => ({ filename, path }));
};

const emailSetupError = () => {
  if (process.env.EMAIL_ENABLED !== 'true') return 'Email is disabled in local mode. Core CRM operations remain available.';
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return 'Email sending is not configured. Add EMAIL_USER and EMAIL_PASS in CRM-backend .env, then restart the backend.';
  }
  return null;
};

const safeSendMail = async (mailOptions) => {
  if (emailSetupError()) return false;
  try {
    const info = await transporter.sendMail(mailOptions);
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    if (!accepted.length) {
      console.error('automation email rejected:', {
        messageId: info.messageId,
        rejected,
        response: info.response,
      });
      return false;
    }
    console.log('automation email accepted:', {
      messageId: info.messageId,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
    });
    return true;
  } catch (err) {
    console.error('automation email failed:', err.code || '', err.command || '', err.message);
    return false;
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const indiaNowParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
};

const formatFollowupTime = (value) => value
  ? new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(value))
  : 'Time not set';

const followupRowsHtml = (rows) => {
  if (!rows.length) return '<p style="padding:14px;background:#f4f7f5;border-radius:8px;">No follow-ups scheduled for today.</p>';
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#166534;color:#fff;">
        <th style="padding:9px;text-align:left;">Schedule</th>
        <th style="padding:9px;text-align:left;">Lead</th>
        <th style="padding:9px;text-align:left;">Follow-up</th>
        <th style="padding:9px;text-align:left;">Type</th>
        <th style="padding:9px;text-align:left;">Status</th>
      </tr></thead>
      <tbody>${rows.map((item) => `
        <tr>
          <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${item.is_overdue ? `<strong style="color:#b42318;">Overdue</strong><br/>${escapeHtml(item.start_date_label)} ${escapeHtml(item.start_time_label || '')}` : escapeHtml(item.start_date_label ? item.start_date_label+' '+(item.start_time_label||'') : 'Not scheduled')}</td>
          <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.lead_name || '-')}</td>
          <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.title || '-')}</td>
          <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.type || '-')}</td>
          <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.status || '-')}</td>
        </tr>`).join('')}</tbody>
    </table>`;
};

const claimDailyDigest = async (date, email, type) => {
  const { rows } = await pool.query(
    `INSERT INTO crm_daily_digest_log (digest_date, recipient_email, digest_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (digest_date, recipient_email, digest_type) DO NOTHING
     RETURNING id`,
    [date, email.toLowerCase(), type]
  );
  return rows[0]?.id || null;
};

const deliverClaimedDigest = async ({ claimId, to, subject, html }) => {
  let sent=false;
  try {
   const info=await transporter.sendFollowupDigest({from:'Indra CRM <'+process.env.EMAIL_USER+'>',to,subject,html});
   sent=Array.isArray(info.accepted)&&info.accepted.some(address=>String(address).toLowerCase()===to.toLowerCase());
  }catch(error){console.error('Daily follow-up email failed:',error.code||error.message);}
  if (sent) {
    await pool.query(`UPDATE crm_daily_digest_log SET status='sent', sent_at=NOW() WHERE id=$1`, [claimId]);
  } else {
    await pool.query('DELETE FROM crm_daily_digest_log WHERE id=$1', [claimId]);
  }
  return sent;
};

const resolveDigestRecipients = async followups => {
 const {rows:users}=await pool.query("SELECT id::text AS id,full_name,email,role FROM users WHERE LOWER(status)='active'");
 return require('../services/followupRecipients').recipients(users,followups,process.env.ADMIN_REPORT_EMAIL);
};

const sendDailyFollowupDigests = async (digestDate) => {
  await ensureDailyDigestTable();
  const { rows: followups } = await pool.query(
    `SELECT lead_name, title, status, type, category, assigned, assigned_user_id, start_time,
            TO_CHAR(start_time, 'DD Mon YYYY') AS start_date_label,
            TO_CHAR(start_time, 'HH12:MI AM') AS start_time_label,
            (start_time::date < $1::date) AS is_overdue,
            description
     FROM crm_followups
     WHERE status IN ('Scheduled', 'Pending')
     ORDER BY assigned NULLS LAST, start_time ASC`,
    [digestDate]
  );
  const { salespeople, adminEmails } = await resolveDigestRecipients(followups);
  const {belongsTo}=require('../services/followupRecipients');

  for (const person of salespeople.filter((person) => person.email)) {
    const own = followups.filter((item) => belongsTo(item, person));
    const overdueCount = own.filter((item) => item.is_overdue).length;
    const todayCount = own.length - overdueCount;
    const claimId = await claimDailyDigest(digestDate, person.email, 'salesperson');
    if (!claimId) continue;
    await deliverClaimedDigest({
      claimId,
      to: person.email,
      subject: `Follow-ups: ${todayCount} pending/upcoming, ${overdueCount} overdue - ${digestDate}`,
      html: `<p>Good morning ${escapeHtml(person.name)},</p><p>You have <strong>${todayCount}</strong> follow-up${todayCount === 1 ? '' : 's'} pending/upcoming and <strong>${overdueCount}</strong> overdue pending follow-up${overdueCount === 1 ? '' : 's'}.</p>${followupRowsHtml(own)}<p>Regards,<br/>Manod CRM</p>`,
    });
  }

  const sections = salespeople.map((person) => {
    const own = followups.filter((item) => belongsTo(item, person));
    return `<h3 style="margin-top:24px;">${escapeHtml(person.name)} — ${own.length}</h3>${followupRowsHtml(own)}`;
  }).join('');
  const unassigned = followups.filter((item) => !salespeople.some((person) => belongsTo(item, person)));
  const totalOverdue = followups.filter((item) => item.is_overdue).length;
  const totalToday = followups.length - totalOverdue;
  const adminHtml = `<p>Good morning,</p><p>There are <strong>${totalToday}</strong> follow-ups pending/upcoming and <strong>${totalOverdue}</strong> overdue pending follow-ups.</p>${sections}${unassigned.length ? `<h3 style="margin-top:24px;">Unassigned / Other — ${unassigned.length}</h3>${followupRowsHtml(unassigned)}` : ''}<p>Regards,<br/>Manod CRM</p>`;
  for (const email of adminEmails) {
    const claimId = await claimDailyDigest(digestDate, email, 'admin');
    if (!claimId) continue;
    await deliverClaimedDigest({ claimId, to: email, subject: `Sales follow-ups: ${totalToday} pending/upcoming, ${totalOverdue} overdue - ${digestDate}`, html: adminHtml });
  }
};

const machineAlertRowsHtml = (items) => `
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#166534;color:#fff;">
      <th style="padding:9px;text-align:left;">Customer</th>
      <th style="padding:9px;text-align:left;">Machine / Item</th>
      <th style="padding:9px;text-align:left;">Alert</th>
      <th style="padding:9px;text-align:left;">Due date</th>
    </tr></thead>
    <tbody>${items.map((item) => `<tr>
      <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.customer_name)}</td>
      <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.label)}</td>
      <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.alert)}</td>
      <td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.due_date)}</td>
    </tr>`).join('')}</tbody>
  </table>`;

const claimMachineAlert = async (eventKey, email) => {
  const { rows } = await pool.query(
    `INSERT INTO crm_machine_automation_log (event_key, recipient_email)
     VALUES ($1, LOWER($2)) ON CONFLICT (event_key, recipient_email) DO NOTHING RETURNING id`,
    [eventKey, email]
  );
  return rows[0]?.id || null;
};

const deliverMachineAlert = async ({ eventKey, to, subject, html }) => {
  const claimId = await claimMachineAlert(eventKey, to);
  if (!claimId) return false;
  const sent = await safeSendMail({ from: `"Manod CRM" <${process.env.EMAIL_USER}>`, to, subject, html });
  if (sent) await pool.query(`UPDATE crm_machine_automation_log SET status='sent', sent_at=NOW() WHERE id=$1`, [claimId]);
  else await pool.query(`DELETE FROM crm_machine_automation_log WHERE id=$1`, [claimId]);
  return sent;
};

const machineReminderBand = (days) => {
  if (days < 0) return 'overdue';
  if (days === 0) return 'due';
  if (days <= 7) return '7-day';
  if (days <= 15) return '15-day';
  return '30-day';
};

const processMachineServiceAutomations = async (digestDate) => {
  await ensureMachineServiceTables();
  const { rows: users } = await pool.query(`SELECT id::text AS id, full_name, email, role FROM users WHERE LOWER(COALESCE(status,'active'))='active'`);
  const adminEmails = [...new Set([
    ...String(process.env.ADMIN_REPORT_EMAIL || process.env.ADMIN_EMAIL || '').split(',').map((value) => value.trim()).filter(Boolean),
    ...users.filter((user) => normalize(user.role) === 'admin').map((user) => user.email).filter(Boolean),
  ].map((email) => email.toLowerCase()))];
  const { rows: machines } = await pool.query(`
    SELECT m.*, l.email AS customer_email,
      (m.next_maintenance - $1::date) AS service_days,
      (m.warranty_end - $1::date) AS warranty_days,
      (m.amc_end - $1::date) AS amc_days
    FROM crm_installed_machines m
    LEFT JOIN crm_leads l ON l.id::text=m.lead_id
    WHERE LOWER(COALESCE(m.status,'active'))='active'
      AND (m.next_maintenance <= $1::date + 7 OR m.warranty_end <= $1::date + 30 OR m.amc_end <= $1::date + 30)
  `, [digestDate]);
  const { rows: consumables } = await pool.query(`
    SELECT c.*, COALESCE(c.assigned_user_id, m.assigned_user_id) AS reminder_assigned_user_id,
      COALESCE(c.assigned, m.assigned) AS reminder_assigned,
      (c.next_requirement_date - $1::date) AS requirement_days
    FROM crm_machine_consumables c
    LEFT JOIN crm_installed_machines m ON m.id=c.machine_id
    WHERE LOWER(COALESCE(c.status,'active'))='active'
      AND LOWER(COALESCE(c.opportunity_status,'reminder due')) IN ('reminder due','quotation sent')
      AND c.next_requirement_date <= $1::date + 7
  `, [digestDate]);
  const alertsByRecipient = new Map();
  const addAlert = (email, eventKey, item) => {
    if (!email) return;
    const key = email.toLowerCase();
    if (!alertsByRecipient.has(key)) alertsByRecipient.set(key, []);
    alertsByRecipient.get(key).push({ eventKey, ...item });
  };
  for (const machine of machines) {
    const assignedUser = users.find((user) => String(user.id) === String(machine.assigned_user_id)) || users.find((user) => normalize(user.full_name) === normalize(machine.assigned));
    const recipients = [...new Set([assignedUser?.email, ...adminEmails].filter(Boolean))];
    const definitions = [
      ['service', machine.service_days, machine.next_maintenance, 'Service / maintenance'],
      ['warranty', machine.warranty_days, machine.warranty_end, 'Warranty expiry'],
      ['amc', machine.amc_days, machine.amc_end, 'AMC expiry'],
    ];
    for (const [type, rawDays, date, label] of definitions) {
      if (rawDays === null || rawDays === undefined || Number(rawDays) > (type === 'service' ? 7 : 30)) continue;
      const days = Number(rawDays);
      const band = machineReminderBand(days);
      const item = { customer_name: machine.customer_name, label: `${machine.machine_model}${machine.serial_number ? ` (${machine.serial_number})` : ''}`, alert: `${label} ${days < 0 ? `${Math.abs(days)} day(s) overdue` : days === 0 ? 'due today' : `in ${days} day(s)`}`, due_date: date };
      for (const email of recipients) addAlert(email, `machine-${machine.id}-${type}-${band}`, item);
      if (type === 'service' && days === 1 && machine.customer_email) {
        await deliverMachineAlert({ eventKey: `machine-${machine.id}-customer-service-1-day-${date}`, to: machine.customer_email, subject: `Service reminder - ${machine.machine_model}`, html: `<p>Dear ${escapeHtml(machine.customer_name)},</p><p>This is a reminder that service for your <strong>${escapeHtml(machine.machine_model)}</strong> is scheduled for ${escapeHtml(date)}.</p><p>Regards,<br/>Manod CRM</p>` });
      }
      if (type === 'amc' && days <= 30 && days >= 0) {
        await pool.query(`
          INSERT INTO crm_machine_replacement_opportunities
            (machine_id, lead_id, customer_name, current_model, replacement_reason, expected_purchase_date, stage, assigned_user_id, assigned, status, notes)
          SELECT $1,$2,$3,$4,'AMC renewal / replacement review',$5,'New',$6,$7,'Open','Automatically created before AMC expiry'
          WHERE NOT EXISTS (
            SELECT 1 FROM crm_machine_replacement_opportunities
            WHERE machine_id=$1 AND status='Open' AND replacement_reason='AMC renewal / replacement review'
          )`, [machine.id, machine.lead_id, machine.customer_name, machine.machine_model, machine.amc_end, machine.assigned_user_id, machine.assigned]);
      }
    }
  }
  for (const consumable of consumables) {
    const days = Number(consumable.requirement_days);
    const band = machineReminderBand(days);
    const item = { customer_name: consumable.customer_name, label: consumable.item_name, alert: days < 0 ? `Consumable ${Math.abs(days)} day(s) overdue` : days === 0 ? 'Consumable due today' : `Consumable required in ${days} day(s)`, due_date: consumable.next_requirement_date };
    const assignedUser = users.find((user) => String(user.id) === String(consumable.reminder_assigned_user_id)) || users.find((user) => normalize(user.full_name) === normalize(consumable.reminder_assigned));
    for (const email of [...new Set([assignedUser?.email, ...adminEmails].filter(Boolean))]) addAlert(email, `consumable-${consumable.id}-${band}`, item);
  }
  for (const [email, alerts] of alertsByRecipient) {
    const pending = [];
    for (const alert of alerts) {
      const claimId = await claimMachineAlert(alert.eventKey, email);
      if (claimId) pending.push({ claimId, alert });
    }
    if (!pending.length) continue;
    const sent = await safeSendMail({ from: `"Manod CRM" <${process.env.EMAIL_USER}>`, to: email, subject: `Machine & service alerts - ${digestDate}`, html: `<p>Good morning,</p><p>The following machine-service activities require attention:</p>${machineAlertRowsHtml(pending.map((entry) => entry.alert))}<p>Regards,<br/>Manod CRM</p>` });
    for (const { claimId } of pending) {
      if (sent) await pool.query(`UPDATE crm_machine_automation_log SET status='sent', sent_at=NOW() WHERE id=$1`, [claimId]);
      else await pool.query(`DELETE FROM crm_machine_automation_log WHERE id=$1`, [claimId]);
    }
  }
};

const proposalPublicUrl = (token) => {
  const configured = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const frontend = configured.split(',')[0].trim().replace(/\/+$/, '');
  return `${frontend}/proposal/${encodeURIComponent(token)}`;
};

const proposalEmailHtml = (proposal, publicUrl) => `
  <p>Dear ${proposal.lead_name || 'Customer'},</p>
  <p>Please review the proposal from Manod Technologies using the secure link below.</p>
  <p style="margin:24px 0;">
    <a href="${publicUrl}" style="background:#166534;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">View Proposal</a>
  </p>
  <p>This private link lets you review and respond to the proposal online.</p>
  <p>Regards,<br/>Manod Technologies</p>
`;

const proposalReminderHtml = (proposal, publicUrl, finalReminder = false) => `
  <p>Dear ${proposal.lead_name || 'Customer'},</p>
  <p>${finalReminder
    ? 'This is a final reminder regarding the proposal you reviewed. Please let us know your decision or any questions.'
    : 'We noticed that you reviewed our proposal. Please let us know if you have any questions or would like to discuss the next steps.'}</p>
  <p style="margin:24px 0;">
    <a href="${publicUrl}" style="background:#166534;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Review Proposal</a>
  </p>
  <p>Regards,<br/>Manod Technologies</p>
`;

const sendWelcomeEmail = async (lead) => {
  if (!lead?.email) return false;
  return safeSendMail({
    from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
    to: lead.email,
    subject: 'Thank you for contacting Manod Technologies',
    attachments: optionalCompanyAttachments(),
    html: `
      <p>Dear ${lead.contact || lead.name || 'Customer'},</p>
      <p>Thank you for contacting Manod Technologies.</p>
      <p>Our executive will contact you shortly.</p>
      <p>Regards,<br/>Manod Team</p>
    `,
  });
};

const notifySalesperson = async (lead) => {
  const to = salespersonEmail(lead.assigned);
  if (!to) return false;
  return safeSendMail({
    from: `"Manod CRM" <${process.env.EMAIL_USER}>`,
    to,
    subject: `New lead assigned: ${lead.name}`,
    html: `
      <p>A new lead has been assigned to you.</p>
      <p><strong>Name:</strong> ${lead.name || '-'}</p>
      <p><strong>Company:</strong> ${lead.company || '-'}</p>
      <p><strong>Phone:</strong> ${lead.mobile || '-'}</p>
      <p><strong>Email:</strong> ${lead.email || '-'}</p>
      <p><strong>Location:</strong> ${lead.location || '-'}</p>
      <p><strong>Source:</strong> ${lead.source || '-'}</p>
    `,
  });
};

const customerSuccessEmailContent = (stage, journey) => {
  const customer = journey.customer_name || journey.lead_name || 'Customer';
  const company = journey.company || customer;
  const projectName = journey.project_name || journey.projectName || company;
  const assigned = journey.assigned || 'Implementation Team';
  const managerEmail = salespersonEmail(assigned) || process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || '';
  const managerPhone = process.env.PROJECT_MANAGER_PHONE || process.env.COMPANY_PHONE || process.env.SUPPORT_PHONE || '';
  const companyPhone = process.env.COMPANY_PHONE || process.env.SUPPORT_PHONE || '';
  const supportPhone = process.env.SUPPORT_PHONE || process.env.COMPANY_PHONE || '';
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || '';
  const website = process.env.COMPANY_WEBSITE || 'www.manodtechnologies.com';
  const dueDate = journey.due_date ? new Date(journey.due_date).toLocaleDateString('en-IN') : null;
  const amount = journey.amount || journey.value || 'As per quotation';
  const invoiceNo = journey.invoice_no || journey.invoiceNo || 'To be shared by Accounts Team';
  const trainingDate = journey.training_date || journey.trainingDate || dueDate || 'To be confirmed';
  const trainingTime = journey.training_time || journey.trainingTime || 'To be confirmed';
  const meetingLink = journey.meeting_link || journey.meetingLink || process.env.TRAINING_MEETING_LINK || 'To be shared before the session';
  const feedbackUrl = journey.feedback_url || journey.feedbackUrl || process.env.FEEDBACK_URL || 'To be shared by Customer Success Team';
  const expiryDate = journey.expiry_date || journey.expiryDate || dueDate || 'To be confirmed';
  const expectedCompletionDate = journey.expected_completion_date || journey.expectedCompletionDate || dueDate || 'To be confirmed';
  const details = dueDate ? `<p><strong>Target date:</strong> ${dueDate}</p>` : '';

  const templates = {
    'Order Confirmed': {
      subject: 'Your Order Has Been Confirmed',
      body: `
        <p>Thank you for choosing <strong>Manod Technologies</strong>.</p>
        <p>We are pleased to confirm your order for <strong>${projectName}</strong>.</p>
        <p>Our team has successfully received your order and has started the onboarding process. You will receive further updates regarding implementation shortly.</p>
        <p>If you have any questions, please contact us.</p>
        ${companyPhone ? `<p><strong>Phone:</strong> ${companyPhone}</p>` : ''}
        <p><strong>Website:</strong> ${website}</p>
      `,
      signoff: 'Manod Technologies',
    },
    'Invoice Generated': {
      subject: 'Invoice Generated Successfully',
      body: `
        <p>Your invoice has been generated successfully.</p>
        <p><strong>Invoice Number:</strong> ${invoiceNo}</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p>Please review the invoice and complete the payment as per the agreed terms.</p>
        <p>For any billing queries, feel free to contact us.</p>
      `,
      signoff: 'Accounts Team<br/>Manod Technologies',
    },
    'Project Assigned': {
      subject: 'Your Project Has Been Assigned',
      body: `
        <p>Great news!</p>
        <p>Your project has now been assigned to our implementation team.</p>
        <p><strong>Project Manager:</strong> ${assigned}</p>
        ${managerPhone ? `<p><strong>Mobile:</strong> ${managerPhone}</p>` : ''}
        ${managerEmail ? `<p><strong>Email:</strong> ${managerEmail}</p>` : ''}
        <p>Our team will contact you shortly to begin the implementation process.</p>
      `,
      signoff: 'Manod Technologies',
    },
    'Document Collection': {
      subject: 'Documents Required to Begin Implementation',
      body: `
        <p>To begin your project implementation, kindly share the following documents:</p>
        <ul>
          <li>Purchase Order (PO)</li>
          <li>GST details</li>
          <li>Company logo</li>
          <li>Existing data (Excel/CSV)</li>
          <li>User list</li>
          <li>Any additional requirements</li>
        </ul>
        <p>You can reply to this email or upload the documents through our portal.</p>
      `,
      signoff: 'Implementation Team',
    },
    'Implementation Started': {
      subject: 'Project Implementation Started',
      body: `
        <p>We are happy to inform you that the implementation of your project has officially started.</p>
        <p><strong>Current Status:</strong> Implementation In Progress</p>
        <p><strong>Expected Completion:</strong> ${expectedCompletionDate}</p>
        <p>Our team will keep you updated throughout the project.</p>
        <p>Thank you for your trust.</p>
      `,
      signoff: 'Manod Technologies',
    },
    'Training Scheduled': {
      subject: 'User Training Scheduled',
      body: `
        <p>Your product training session has been scheduled.</p>
        <p><strong>Date:</strong> ${trainingDate}</p>
        <p><strong>Time:</strong> ${trainingTime}</p>
        <p><strong>Meeting Link:</strong> ${meetingLink}</p>
        <p>The session will cover system usage, reports, user management, and best practices.</p>
        <p>We look forward to meeting you.</p>
      `,
      signoff: 'Training Team',
    },
    'Go Live': {
      subject: 'Congratulations! Your System Is Live',
      body: `
        <p>Congratulations!</p>
        <p>Your <strong>${projectName}</strong> has successfully gone live.</p>
        <p>You can now begin using the system.</p>
        <p>If you require any assistance, our support team is always available.</p>
        <p>Thank you for choosing Manod Technologies.</p>
      `,
      signoff: 'Implementation Team',
    },
    'Support': {
      subject: "We're Here to Help",
      body: `
        <p>We hope everything is running smoothly.</p>
        <p>If you need any assistance regarding your ERP, CRM, AI solution, or custom software, our support team is ready to help.</p>
        ${supportPhone ? `<p><strong>Support:</strong> ${supportPhone}</p>` : ''}
        ${supportEmail ? `<p><strong>Email:</strong> ${supportEmail}</p>` : ''}
        <p>Feel free to contact us anytime.</p>
      `,
      signoff: 'Customer Support Team',
    },
    'Feedback Collected': {
      subject: "We'd Love Your Feedback",
      body: `
        <p>Thank you for choosing Manod Technologies.</p>
        <p>Your feedback helps us improve our products and services.</p>
        <p>Please take a minute to rate your experience.</p>
        <p><strong>Feedback Link:</strong> ${feedbackUrl}</p>
        <p>We appreciate your valuable feedback.</p>
      `,
      signoff: 'Customer Success Team',
    },
    'Upsell Opportunity': {
      subject: 'Enhance Your Business with More Smart Solutions',
      body: `
        <p>Thank you for being our valued customer.</p>
        <p>Based on your current solution, we recommend additional products that can further improve your business operations.</p>
        <p><strong>Recommended Solutions:</strong></p>
        <ul>
          <li>AI Automation</li>
          <li>CRM</li>
          <li>HRMS</li>
          <li>Inventory Management</li>
          <li>Mobile App</li>
          <li>Customer Portal</li>
          <li>WhatsApp Automation</li>
          <li>Business Intelligence Dashboard</li>
        </ul>
        <p>Contact us for a free demonstration.</p>
      `,
      signoff: 'Business Development Team',
    },
    'AMC / Renewal Reminder': {
      subject: 'Annual Support Renewal Reminder',
      body: `
        <p>This is a friendly reminder that your Annual Maintenance Contract (AMC) will expire on:</p>
        <p><strong>${expiryDate}</strong></p>
        <p>Renewing your AMC ensures:</p>
        <ul>
          <li>Priority support</li>
          <li>Software updates</li>
          <li>Bug fixes</li>
          <li>Security updates</li>
          <li>Technical assistance</li>
        </ul>
        <p>Please contact us to renew your AMC and continue enjoying uninterrupted support.</p>
      `,
      signoff: 'Manod Technologies',
    },
  };

  const content = templates[stage] || {
    subject: `Customer Success update - ${company}`,
    body: `<p>Your Customer Success stage has been updated to <strong>${stage}</strong>.</p>${details}`,
    signoff: 'Manod Team',
  };

  return {
    subject: content.subject,
    html: `
      <p>Dear ${customer},</p>
      ${content.body}
      <p>Regards,<br/>${content.signoff}</p>
    `,
  };
};
const sendCustomerSuccessStageEmail = async (journey, stage) => {
  if (!journey?.email) return false;
  const content = customerSuccessEmailContent(stage, journey);
  return safeSendMail({
    from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
    to: journey.email,
    subject: content.subject,
    html: content.html,
  });
};
const ensureFollowup = async ({ lead, title, type = 'Call', category = 'Sales', daysFromNow = 1, desc }) => {
  await ensureDailyDigestTable();
  const leadName = leadNameOf(lead);
  if (!leadName || !title) return null;

  const existing = await pool.query(
    `SELECT id FROM crm_followups
     WHERE lead_name = $1 AND title = $2 AND status IN ('Scheduled', 'Pending')
     LIMIT 1`,
    [leadName, title]
  );
  if (existing.rows.length) return null;

  const start = addDays(daysFromNow);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const assigned = leadAssignedOf(lead);
  const assignedUserId = await resolveAssignedUserId(assigned, lead?.assigned_user_id || lead?.assignedUserId);
  const { rows } = await pool.query(
    `INSERT INTO crm_followups (lead_name, title, status, type, category, assigned, assigned_user_id, start_time, end_time, description)
     VALUES ($1, $2, 'Scheduled', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [leadName, title, type, category, assigned, assignedUserId, start, end, desc || null]
  );
  return rows[0];
};


const ensureCustomerSuccessJourney = async (lead) => {
  const leadName = leadNameOf(lead);
  if (!leadName) return null;
  await ensureCustomerSuccessTable();

  const existing = await pool.query(
    `SELECT * FROM crm_customer_success
     WHERE lead_id = $1
     ORDER BY id
     LIMIT 1`,
    [lead.id ? String(lead.id) : null]
  );
  if (existing.rows.length) {
    const { rows: synced } = await pool.query(
      `UPDATE crm_customer_success SET
        lead_id=$1, lead_name=$2, customer_name=$3, company=$4, email=$5, phone=$6, assigned=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [
        lead.id ? String(lead.id) : existing.rows[0].lead_id,
        leadName,
        lead.company || leadName,
        lead.company || null,
        lead.email || null,
        lead.mobile || lead.phone || null,
        leadAssignedOf(lead),
        existing.rows[0].id,
      ]
    );
    return synced[0];
  }

  const firstStage = CUSTOMER_SUCCESS_STAGES[0];
  const dueDate = addDays(2).toISOString().slice(0, 10);
  const history = [{ stage: firstStage, date: new Date().toISOString(), note: 'Created automatically after lead won.' }];
  const { rows } = await pool.query(
    `INSERT INTO crm_customer_success
      (lead_id, lead_name, customer_name, company, email, phone, assigned, current_stage, due_date, notes, stage_history)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      lead.id ? String(lead.id) : null,
      leadName,
      lead.company || leadName,
      lead.company || null,
      lead.email || null,
      lead.mobile || lead.phone || null,
      leadAssignedOf(lead),
      firstStage,
      dueDate,
      'Customer Success workflow created automatically after lead was won.',
      jsonValue(history, []),
    ]
  );

  const journey = rows[0];
  await sendCustomerSuccessStageEmail(journey, firstStage);

  for (const item of CUSTOMER_SUCCESS_PLAN) {
    await ensureFollowup({
      lead,
      title: `Customer Success: ${item.title}`,
      type: item.type,
      category: item.category,
      daysFromNow: item.days,
      desc: `${item.stage} stage for ${lead.company || leadName}.`,
    });
  }

  return journey;
};
const formatINR = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Number(value) || 0);

const buildStandardProposalBody = ({ customer, value, dueDate }) => `
  <p>Dear ${customer || 'Customer'},</p>
  <p>Thank you for your enquiry. Please find our standard quotation for your requirement.</p>
  <table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">
    <tbody>
      <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Customer / Lead</td><td style="border:1px solid #e5e7eb; padding:8px;">${customer || 'Customer'}</td></tr>
      <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Quotation Value</td><td style="border:1px solid #e5e7eb; padding:8px;"><strong>${formatINR(value)}</strong></td></tr>
      <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Validity</td><td style="border:1px solid #e5e7eb; padding:8px;">${dueDate || '7 days from quotation date'}</td></tr>
    </tbody>
  </table>
  <p><strong>Scope of Work</strong></p>
  <ul>
    <li>Requirement review and confirmation</li>
    <li>Solution setup / implementation as discussed</li>
    <li>Testing, handover, and basic user guidance</li>
    <li>Support as per agreed terms</li>
  </ul>
  <p><strong>Terms</strong></p>
  <ul>
    <li>Taxes, hosting, third-party charges, and custom changes will be billed as applicable.</li>
    <li>Delivery timeline starts after confirmation and receipt of required documents.</li>
  </ul>
  <p>Kindly review and confirm so we can proceed with the next step.</p>
  <p>Regards,<br/>Manod Technologies</p>
`;
const ensureProposalQuotation = async (lead) => {
  const leadName = leadNameOf(lead);
  if (!leadName) return null;

  const existing = await pool.query(
    `SELECT id FROM crm_proposals
     WHERE lead_name = $1 AND subject ILIKE 'Quotation:%'
     LIMIT 1`,
    [leadName]
  );
  if (existing.rows.length) return null;

  const dueDate = addDays(7).toISOString().slice(0, 10);
  const value = lead.value || 0;
  const subject = `Quotation: ${lead.company || leadName}`;
  const body = `
    <p>Dear ${lead.contact || leadName},</p>
    <p>Thank you for your enquiry. Please find our quotation for your requirement.</p>
    <p><strong>Estimated value:</strong> ${value}</p>
    <p>Regards,<br/>Manod Technologies</p>
  `;

  const { rows } = await pool.query(
    `INSERT INTO crm_proposals (lead_name, subject, sent_by, value, status, due_date, body)
     VALUES ($1, $2, $3, $4, 'Draft', $5, $6) RETURNING *`,
    [leadName, subject, leadAssignedOf(lead), value, dueDate, body]
  );
  return rows[0];
};


const paymentReminderEmailContent = (stage, reminder) => {
  const customer = reminder.customer_name || reminder.lead_name || 'Customer';
  const amount = formatINR(reminder.amount || 0);
  const dueDate = reminder.due_date ? new Date(reminder.due_date).toLocaleDateString('en-IN') : 'at the earliest';
  const templates = {
    'Advance Payment Pending': {
      subject: 'Advance Payment Pending - Manod Technologies',
      body: `
        <p>Thank you for accepting our proposal.</p>
        <p>Your order is now ready for advance payment processing.</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p><strong>Due Date:</strong> ${dueDate}</p>
        <p>Once payment is received, our Customer Success process will begin.</p>
      `,
    },
    'Reminder 1': {
      subject: 'Payment Reminder 1 - Manod Technologies',
      body: `
        <p>This is a gentle reminder that the advance payment is pending.</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p>Please complete the payment so we can start the next process.</p>
      `,
    },
    'Reminder 2': {
      subject: 'Payment Reminder 2 - Manod Technologies',
      body: `
        <p>We would like to remind you that the advance payment is still pending.</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p>Kindly complete the payment to avoid delays in project initiation.</p>
      `,
    },
    'Final Reminder': {
      subject: 'Final Payment Reminder - Manod Technologies',
      body: `
        <p>This is the final reminder for the pending advance payment.</p>
        <p><strong>Amount:</strong> ${amount}</p>
        <p>Please complete the payment immediately so we can proceed with your project.</p>
      `,
    },
    'Payment Received': {
      subject: 'Payment Received - Customer Success Started',
      body: `
        <p>We have received your payment. Thank you.</p>
        <p>Your Customer Success workflow has now started, and our team will contact you for the next steps.</p>
      `,
    },
  };
  const content = templates[stage] || templates['Advance Payment Pending'];
  return {
    subject: content.subject,
    html: `
      <p>Dear ${customer},</p>
      ${content.body}
      <p>Regards,<br/>Manod Technologies</p>
    `,
  };
};

const syncMachineRequirementFollowup = async (lead, requestedDate, activity) => {
  if (!lead?.name || !requestedDate) return null;
  await ensureDailyDigestTable();
  const title = `Machine Requirement: ${activity || 'Customer follow-up'}`;
  const start = new Date(requestedDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const assignedUserId = await resolveAssignedUserId(lead.assigned, lead.assigned_user_id || lead.assignedUserId);
  const existing = await pool.query(
    `SELECT id FROM crm_followups WHERE lead_name=$1 AND title LIKE 'Machine Requirement:%'
     AND status IN ('Scheduled', 'Pending') ORDER BY created_at DESC LIMIT 1`,
    [lead.name]
  );
  if (existing.rows[0]) {
    const { rows } = await pool.query(
      `UPDATE crm_followups SET title=$1, assigned=$2, assigned_user_id=$3, start_time=$4,
       end_time=$5, description=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [title, lead.assigned || null, assignedUserId, start, end, lead.requirement_details || null, existing.rows[0].id]
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO crm_followups
     (lead_name, title, status, type, category, assigned, assigned_user_id, start_time, end_time, description)
     VALUES ($1,$2,'Scheduled','Call','Sales',$3,$4,$5,$6,$7) RETURNING *`,
    [lead.name, title, lead.assigned || null, assignedUserId, start, end, lead.requirement_details || null]
  );
  return rows[0];
};

const sendPaymentReminderStageEmail = async (reminder, stage) => {
  if (!reminder?.email) return false;
  const content = paymentReminderEmailContent(stage, reminder);
  return safeSendMail({
    from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
    to: reminder.email,
    subject: content.subject,
    html: content.html,
  });
};

const ensurePaymentReminderForProposal = async (proposal, lead) => {
  const leadName = proposal?.lead_name || proposal?.lead || leadNameOf(lead);
  if (!leadName || !proposal?.id) return null;
  await ensurePaymentReminderTable();
  const amount = Number(proposal?.value ?? lead?.value ?? 0) || 0;
  const dueDate = addDays(2).toISOString().slice(0, 10);
  const proposalId = proposal?.id ? String(proposal.id) : null;

  const existing = await pool.query(
    `SELECT * FROM crm_payment_reminders
     WHERE proposal_id=$1
     ORDER BY id
     LIMIT 1`,
    [proposalId]
  );
  if (existing.rows.length) {
    const { rows } = await pool.query(
      `UPDATE crm_payment_reminders SET
        proposal_id=$1, lead_id=$2, lead_name=$3, customer_name=$4, company=$5,
        email=$6, phone=$7, assigned=$8, amount=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [
        proposalId || existing.rows[0].proposal_id,
        lead?.id ? String(lead.id) : existing.rows[0].lead_id,
        leadName,
        lead?.company || leadName,
        lead?.company || null,
        lead?.email || existing.rows[0].email || null,
        lead?.mobile || lead?.phone || existing.rows[0].phone || null,
        leadAssignedOf(lead) || proposal?.sent_by || existing.rows[0].assigned,
        amount,
        existing.rows[0].id,
      ]
    );
    return rows[0];
  }

  const firstStage = PAYMENT_REMINDER_STAGES[0];
  const history = [{ stage: firstStage, date: new Date().toISOString(), note: 'Created automatically after proposal accepted.' }];
  const { rows } = await pool.query(
    `INSERT INTO crm_payment_reminders
      (proposal_id, lead_id, lead_name, customer_name, company, email, phone, assigned, amount, current_stage, status, due_date, notes, stage_history)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', $11, $12, $13)
     ON CONFLICT (proposal_id) WHERE proposal_id IS NOT NULL DO UPDATE SET updated_at=NOW() RETURNING *`,
    [
      proposalId,
      lead?.id ? String(lead.id) : null,
      leadName,
      lead?.company || leadName,
      lead?.company || null,
      lead?.email || null,
      lead?.mobile || lead?.phone || null,
      leadAssignedOf(lead) || proposal?.sent_by || null,
      amount,
      firstStage,
      dueDate,
      'Payment workflow created automatically after proposal acceptance.',
      jsonValue(history, []),
    ]
  );
  const reminder = rows[0];
  await sendPaymentReminderStageEmail(reminder, firstStage);
  for (const item of PAYMENT_REMINDER_PLAN) {
    await ensureFollowup({
      lead: lead || { name: leadName, assigned: proposal?.sent_by },
      title: `Payment Reminder: ${item.title}`,
      type: item.type,
      category: item.category,
      daysFromNow: item.days,
      desc: `${item.stage} for accepted proposal ${proposal?.subject || leadName}.`,
    });
  }
  return reminder;
};

const runLeadAutomation = async (lead, previousStage) => {
  const stage = lead?.stage || 'New';
  const stageChanged = previousStage === undefined || previousStage !== stage;

  if (stage === 'New' && previousStage === undefined) {
    await ensureFollowup({
      lead,
      title: 'New client follow-up message',
      type: 'Email',
      daysFromNow: 1,
      desc: 'Send welcome message and confirm the customer requirement.',
    });
  }

  if (stage === 'Proposal' && stageChanged) {
    await ensureProposalQuotation(lead);
    await ensureFollowup({
      lead,
      title: 'Send proposal quotation',
      type: 'Email',
      daysFromNow: 0,
      desc: 'Review the quotation draft and send it to the customer.',
    });
  }

  if (stage === 'Won' && stageChanged) {
    await ensurePaymentReminderForProposal(null, lead);
    await ensureFollowup({
      lead,
      title: 'Advance payment follow-up',
      type: 'Call',
      category: 'Sales',
      daysFromNow: 1,
      desc: 'Lead is won. Confirm accepted proposal and advance payment status.',
    });
  }
};

const runProposalAutomation = async (proposal, previousStatus) => {
  const status = proposal?.status;
  const leadName = proposal?.lead_name || proposal?.lead;
  const statusChanged = previousStatus === undefined || previousStatus !== status;
  if (!leadName || !statusChanged) return;

  if (status === 'Sent' || status === 'Viewed') {
    await ensureFollowup({
      lead: { name: leadName, assigned: proposal.sent_by },
      title: 'Proposal follow-up',
      type: 'Call',
      daysFromNow: 2,
      desc: 'Follow up after sending the proposal quotation.',
    });
  }

  if (status === 'Accepted') {
    const { rows } = await pool.query(
      `UPDATE crm_leads
       SET stage='Won', converted=true, converted_date=CURRENT_DATE, updated_at=NOW()
       WHERE id::text=$1 RETURNING *`,
      [proposal.lead_id]
    );
    const lead = rows[0] || { name: leadName, assigned: proposal.sent_by, converted: true, stage: 'Won' };
    await ensurePaymentReminderForProposal(proposal, lead);
  }

  if (status === 'Rejected') {
    await ensureFollowup({
      lead: { name: leadName, assigned: proposal.sent_by },
      title: 'Proposal rejection follow-up',
      type: 'Call',
      daysFromNow: 3,
      desc: 'Understand why the proposal was rejected and plan the next action.',
    });
  }
};

const processProposalEngagements = async () => {
  await ensureProposalAutomationColumns();
  await pool.query(`
    UPDATE crm_proposals
    SET status='Expired', updated_at=NOW()
    WHERE status IN ('Sent', 'Viewed')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
  `);

  const { rows } = await pool.query(`
    SELECT p.*, l.email, l.assigned
    FROM crm_proposals p
    LEFT JOIN crm_leads l ON l.name = p.lead_name
    WHERE p.status='Viewed'
      AND p.first_viewed_at IS NOT NULL
      AND (p.due_date IS NULL OR p.due_date >= CURRENT_DATE)
      AND (
        (p.followup_1_sent_at IS NULL AND p.first_viewed_at <= NOW() - INTERVAL '1 day')
        OR (p.call_task_created_at IS NULL AND p.first_viewed_at <= NOW() - INTERVAL '3 days')
        OR (p.final_reminder_sent_at IS NULL AND p.first_viewed_at <= NOW() - INTERVAL '5 days')
      )
  `);

  for (const proposal of rows) {
    const publicUrl = proposalPublicUrl(proposal.public_token);
    const viewedAt = new Date(proposal.first_viewed_at).getTime();

    if (!proposal.followup_1_sent_at && viewedAt <= Date.now() - 86400000) {
      const sent = proposal.email && await safeSendMail({
        from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
        to: proposal.email,
        subject: `Follow-up: ${proposal.subject}`,
        html: proposalReminderHtml(proposal, publicUrl),
      });
      if (sent) {
        await pool.query(
          `UPDATE crm_proposals SET followup_1_sent_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND status='Viewed' AND followup_1_sent_at IS NULL`,
          [proposal.id]
        );
      }
    }

    if (!proposal.call_task_created_at && viewedAt <= Date.now() - 3 * 86400000) {
      await ensureFollowup({
        lead: { name: proposal.lead_name, assigned: proposal.assigned || proposal.sent_by },
        title: `Proposal response call: ${proposal.subject}`,
        type: 'Call',
        category: 'Sales',
        daysFromNow: 0,
        desc: 'The client viewed the proposal three days ago but has not accepted or rejected it.',
      });
      await pool.query(
        `UPDATE crm_proposals SET call_task_created_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND status='Viewed' AND call_task_created_at IS NULL`,
        [proposal.id]
      );
    }

    if (!proposal.final_reminder_sent_at && viewedAt <= Date.now() - 5 * 86400000) {
      const sent = proposal.email && await safeSendMail({
        from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
        to: proposal.email,
        subject: `Final reminder: ${proposal.subject}`,
        html: proposalReminderHtml(proposal, publicUrl, true),
      });
      if (sent) {
        await pool.query(
          `UPDATE crm_proposals SET final_reminder_sent_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND status='Viewed' AND final_reminder_sent_at IS NULL`,
          [proposal.id]
        );
      }
    }
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENHANCED LEADS ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/leads', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    const { rows } = req.crmIsAdmin
      ? await pool.query('SELECT * FROM crm_leads ORDER BY created_at DESC')
      : await pool.query(`SELECT * FROM crm_leads WHERE LOWER(NULLIF(assigned,'')) IN (LOWER($1),LOWER($2),$3) ORDER BY created_at DESC`, [req.crmUser.full_name || '', req.crmUser.email, String(req.crmUser.id)]);
    res.json({ success: true, leads: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/leads/:id/locations', async (req, res) => {
  try {
    await ensureLeadExtraColumns();
    const { rows } = await pool.query(`SELECT * FROM crm_lead_locations WHERE lead_id=$1 ORDER BY captured_at DESC, id DESC`, [String(req.params.id)]);
    res.json({ success: true, locations: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/leads/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_leads WHERE id=$1', [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/leads', async (req, res) => {
  try {
    const {
      name, mobile, email, company, contact, location, industry, source, stage, assigned, notes, value,
      contactType, entityType, taxNumber, address1, address2, city, state, country, zipCode,
      landmark, streetName, buildingNumber, additionalNumber, customFields, contactPersons,
      productCategory, machineType, application, requirementQuantity, installationLocation,
      requirementDetails, budget, expectedPurchaseDate, quotationValue, competitorDetails,
      nextFollowupDate, nextFollowupActivity, gpsLatitude, gpsLongitude, gpsAccuracy, gpsCapturedAt,
    } = req.body;
    await ensureLeadExtraColumns();
    if (stage === 'Won') return res.status(400).json({error:'Accept a proposal to move a lead to Won.'});
    const safeStage = stage || 'New';
    const autoAssigned = req.crmIsSales ? req.crmUser.email : await resolveLeadAssignee({ location, industry, notes, assigned });
    const { rows } = await pool.query(
      `INSERT INTO crm_leads (
        name, mobile, email, company, contact, location, industry, source, stage, assigned, notes, value,
        contact_type, entity_type, tax_number, address1, address2, city, state, country, zip_code,
        landmark, street_name, building_number, additional_number, custom_fields, contact_persons, lead_details,
        product_category, machine_type, application, requirement_quantity, installation_location,
        requirement_details, budget, expected_purchase_date, quotation_value, competitor_details,
        next_followup_date, next_followup_activity, gps_latitude, gps_longitude, gps_accuracy, gps_captured_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44) RETURNING *`,
      [
        name,
        mobile || null,
        email || null,
        company || null,
        contact || null,
        location || null,
        industry || null,
        source || 'Website',
        safeStage,
        autoAssigned || assigned || null,
        notes || null,
        value || 0,
        contactType || 'Lead',
        entityType || 'Individual',
        taxNumber || null,
        address1 || null,
        address2 || null,
        city || null,
        state || null,
        country || null,
        zipCode || null,
        landmark || null,
        streetName || null,
        buildingNumber || null,
        additionalNumber || null,
        jsonValue(customFields, {}),
        jsonValue(contactPersons, []),
        jsonValue(req.body, {}),
        productCategory || null, machineType || null, application || null,
        Number(requirementQuantity) || 0, installationLocation || location || null,
        requirementDetails || null, Number(budget) || 0, expectedPurchaseDate || null,
        Number(quotationValue) || Number(value) || 0, competitorDetails || null,
        nextFollowupDate || null, nextFollowupActivity || null,
        gpsNumber(gpsLatitude),
        gpsNumber(gpsLongitude),
        gpsNumber(gpsAccuracy),
        gpsCapturedAt || null
      ]
    );
    await saveLeadLocationHistory(rows[0].id, req.body);
    await runLeadAutomation(rows[0]);
    await syncMachineRequirementFollowup(rows[0], nextFollowupDate, nextFollowupActivity);
    const [welcomeEmailSent, salespersonEmailSent] = await Promise.all([sendWelcomeEmail(rows[0]), notifySalesperson(rows[0])]);
    res.json({
      success: true,
      lead: rows[0],
      automation: {
        followupCreated: rows[0].stage === 'New',
        welcomeEmailSent,
        salespersonEmailSent,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/leads/:id', async (req, res) => {
  try {
    const {
      name, mobile, email, company, contact, location, industry, source, stage, assigned, notes, value,
      contactType, entityType, taxNumber, address1, address2, city, state, country, zipCode,
      landmark, streetName, buildingNumber, additionalNumber, customFields, contactPersons,
      productCategory, machineType, application, requirementQuantity, installationLocation,
      requirementDetails, budget, expectedPurchaseDate, quotationValue, competitorDetails,
      nextFollowupDate, nextFollowupActivity, gpsLatitude, gpsLongitude, gpsAccuracy, gpsCapturedAt,
    } = req.body;
    await ensureLeadExtraColumns();
    const current = await pool.query('SELECT stage, gps_latitude, gps_longitude FROM crm_leads WHERE id=$1', [req.params.id]);
    const previousStage = current.rows[0]?.stage;
    if (stage === 'Won' && previousStage !== 'Won') {
      return res.status(400).json({ error: 'Accept a proposal to move this lead to Won.' });
    }
    const { rows } = await pool.query(
      `UPDATE crm_leads SET
        name=$1, mobile=$2, email=$3, company=$4, contact=$5, location=$6, industry=$7,
        source=$8, stage=$9, assigned=$10, notes=$11, value=$12,
        contact_type=$13, entity_type=$14, tax_number=$15, address1=$16, address2=$17, city=$18,
        state=$19, country=$20, zip_code=$21, landmark=$22, street_name=$23, building_number=$24,
        additional_number=$25, custom_fields=$26, contact_persons=$27, lead_details=$28,
        product_category=$29, machine_type=$30, application=$31, requirement_quantity=$32,
        installation_location=$33, requirement_details=$34, budget=$35, expected_purchase_date=$36,
        quotation_value=$37, competitor_details=$38, next_followup_date=$39,
        next_followup_activity=$40, gps_latitude=$41, gps_longitude=$42, gps_accuracy=$43,
        gps_captured_at=$44, updated_at=NOW()
       WHERE id=$45 RETURNING *`,
      [
        name,
        mobile || null,
        email || null,
        company || null,
        contact || null,
        location || null,
        industry || null,
        source || 'Website',
        stage || 'New',
        assigned || null,
        notes || null,
        value || 0,
        contactType || 'Lead',
        entityType || 'Individual',
        taxNumber || null,
        address1 || null,
        address2 || null,
        city || null,
        state || null,
        country || null,
        zipCode || null,
        landmark || null,
        streetName || null,
        buildingNumber || null,
        additionalNumber || null,
        jsonValue(customFields, {}),
        jsonValue(contactPersons, []),
        jsonValue(req.body, {}),
        productCategory || null, machineType || null, application || null,
        Number(requirementQuantity) || 0, installationLocation || location || null,
        requirementDetails || null, Number(budget) || 0, expectedPurchaseDate || null,
        Number(quotationValue) || Number(value) || 0, competitorDetails || null,
        nextFollowupDate || null, nextFollowupActivity || null,
        gpsNumber(gpsLatitude),
        gpsNumber(gpsLongitude),
        gpsNumber(gpsAccuracy),
        gpsCapturedAt || null,
        req.params.id,
      ]
    );
    if (rows[0]) {
      const nextLatitude = gpsNumber(gpsLatitude);
      const nextLongitude = gpsNumber(gpsLongitude);
      const locationChanged = Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude)
        && (Number(current.rows[0]?.gps_latitude) !== nextLatitude || Number(current.rows[0]?.gps_longitude) !== nextLongitude);
      if (locationChanged) await saveLeadLocationHistory(rows[0].id, req.body);
      await runLeadAutomation(rows[0], previousStage);
      await syncMachineRequirementFollowup(rows[0], nextFollowupDate, nextFollowupActivity);
    }
    res.json({ success: true, lead: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/leads/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id, name FROM crm_leads WHERE id=$1', [req.params.id]);
    const lead = current.rows[0];
    if (!lead) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }

    await client.query('DELETE FROM crm_payment_reminders WHERE lead_id=$1', [String(lead.id)]);
    await client.query('DELETE FROM crm_customer_success WHERE lead_id=$1', [String(lead.id)]);

    for (const table of ['crm_followups','crm_proposals','crm_contacts','crm_lead_locations']) {
      await client.query('DELETE FROM '+table+' WHERE lead_id=$1',[String(lead.id)]);
    }

    await client.query('DELETE FROM crm_leads WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.patch('/leads/:id/convert', async (req, res) => {
  try {
    const accepted = await pool.query(
      `SELECT p.* FROM crm_proposals p
       JOIN crm_leads l ON p.lead_id = l.id::text
       WHERE l.id=$1 AND p.status='Accepted'
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT 1`,
      [req.params.id]
    );
    if (!accepted.rows[0]) {
      return res.status(400).json({ error: 'Accept a proposal before moving this lead to Won.' });
    }
    const { rows } = await pool.query(
      `UPDATE crm_leads SET converted=true, converted_date=CURRENT_DATE, stage='Won', updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    await ensurePaymentReminderForProposal(accepted.rows[0], rows[0]);
    await runLeadAutomation(rows[0], 'New');
    res.json({ success: true, lead: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENHANCED FOLLOW-UPS ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.post('/leads/:id/ai-call', async (req, res) => {
  if (process.env.SMS_ENABLED !== 'true') return res.status(503).json({error:'External calling is disabled in local mode.'});
  try {
    const { rows } = await pool.query('SELECT * FROM crm_leads WHERE id=$1 LIMIT 1', [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!twilioFactory) {
      return res.status(400).json({ error: 'Twilio package is not installed. Run npm install twilio in CRM-backend-.' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      return res.status(400).json({ error: 'Twilio credentials are missing. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in backend .env.' });
    }

    const toNumber = normalizeCallPhone(req.body?.phone || lead.mobile || lead.phone);
    if (!toNumber) {
      return res.status(400).json({ error: 'Lead phone number is missing or invalid. Use country code like +919876543210.' });
    }

    const leadName = leadNameOf(lead) || 'Customer';
    const message = req.body?.message || `Hello ${leadName}. This is Manod Technologies. Thank you for your enquiry. Are you looking for CRM or ERP software? Our executive will contact you shortly.`;
    if (req.body?.dryRun) {
      return res.json({
        success: true,
        message: 'AI call endpoint is ready.',
        lead: { id: lead.id, name: leadName, phone: toNumber }
      });
    }

    const twiml = `<Response><Say voice="alice" language="en-IN">${escapeTwiml(message)}</Say></Response>`;
    const client = twilioFactory(accountSid, authToken);
    const call = await client.calls.create({ to: toNumber, from: fromNumber, twiml });

    const start = addDays(1);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await ensureDailyDigestTable();
    const assigned = leadAssignedOf(lead);
    const assignedUserId = await resolveAssignedUserId(assigned, lead.assigned_user_id || lead.assignedUserId);
    const { rows: followupRows } = await pool.query(
      `INSERT INTO crm_followups (lead_name, title, status, type, category, assigned, assigned_user_id, start_time, end_time, description)
       VALUES ($1, $2, 'Scheduled', 'Call', 'Sales', $3, $4, $5, $6, $7) RETURNING *`,
      [leadName, 'AI call follow-up', assigned, assignedUserId, start, end, `Twilio AI call started. Call SID: ${call.sid}. Message: ${message}`]
    );

    res.json({
      success: true,
      call: { sid: call.sid, status: call.status, to: toNumber },
      followup: followupRows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/followups', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    const { rows } = req.crmIsAdmin
      ? await pool.query('SELECT * FROM crm_followups ORDER BY created_at DESC')
      : await pool.query(`SELECT * FROM crm_followups WHERE status <> 'Completed' AND (assigned_user_id=$1 OR LOWER(NULLIF(assigned,'')) IN (LOWER($2),LOWER($3),$4)) ORDER BY created_at DESC`, [req.crmUser.id, req.crmUser.full_name || '', req.crmUser.email, String(req.crmUser.id)]);
    const data = rows.map(r => ({
      id: r.id,
      lead: r.lead || r.lead_name || '',
      title: r.title,
      status: r.status,
      type: r.type,
      category: r.category,
      assigned: r.assigned,
      assignedUserId: r.assigned_user_id,
      start: r.start_time ? new Date(r.start_time).toISOString().slice(0, 16) : '',
      end: r.end_time ? new Date(r.end_time).toISOString().slice(0, 16) : '',
      desc: r.description || '',
    }));
    res.json({ success: true, followups: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/followups', async (req, res) => {
  try {
    await ensureDailyDigestTable();
    const { lead, lead_name, title, status, type, category, assigned, assignedUserId, assigned_user_id, start, start_time, end, end_time, desc, description } = req.body;
    const leadVal = lead || lead_name || null;
    const startVal = start || start_time || null;
    const endVal = end || end_time || null;
    const descVal = desc || description || null;
    const assignedIdVal = await resolveAssignedUserId(assigned, assignedUserId || assigned_user_id);

    const { rows } = await pool.query(
      `INSERT INTO crm_followups (lead_name, title, status, type, category, assigned, assigned_user_id, start_time, end_time, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [leadVal, title, status || 'Scheduled', type || 'Call', category || 'Sales', assigned || null, assignedIdVal, startVal, endVal, descVal]
    );
    res.json({ success: true, followup: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/followups/:id', async (req, res) => {
  try {
    await ensureDailyDigestTable();
    const { lead, lead_name, title, status, type, category, assigned, assignedUserId, assigned_user_id, start, start_time, end, end_time, desc, description } = req.body;
    const leadVal = lead || lead_name || null;
    const startVal = start || start_time || null;
    const endVal = end || end_time || null;
    const descVal = desc || description || null;
    const assignedIdVal = await resolveAssignedUserId(assigned, assignedUserId || assigned_user_id);

    const { rows } = await pool.query(
      `UPDATE crm_followups SET lead_name=$1, title=$2, status=$3, type=$4, category=$5,
       assigned=$6, assigned_user_id=$7, start_time=$8, end_time=$9, description=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [leadVal, title, status, type, category, assigned || null, assignedIdVal, startVal, endVal, descVal, req.params.id]
    );
    res.json({ success: true, followup: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/followups/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_followups WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENHANCED CAMPAIGNS ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const campaignLeadFilterSql = (group) => {
  const value = String(group || 'all').toLowerCase();
  if (value === 'new') return " AND LOWER(COALESCE(stage, '')) = 'new'";
  if (value === 'proposal') return " AND LOWER(COALESCE(stage, '')) = 'proposal'";
  if (value === 'won') return " AND (LOWER(COALESCE(stage, '')) = 'won' OR LOWER(COALESCE(status, '')) = 'customer')";
  return '';
};

router.get('/campaigns', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_campaigns ORDER BY created_at DESC');
    res.json({ success: true, campaigns: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns', async (req, res) => {
  try {
    const { name, type, status, createdBy, created_by, recipients, subject, body, cc } = req.body;
    const createdByVal = createdBy || created_by || null;

    const { rows } = await pool.query(
      `INSERT INTO crm_campaigns (name, type, status, created_by, recipients, subject, body, cc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, type || 'Email', status || 'Draft', createdByVal, recipients || 0, subject || null, body || null, cc || null]
    );
    res.json({ success: true, campaign: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    const { name, type, status, createdBy, created_by, recipients, subject, body, cc } = req.body;
    const createdByVal = createdBy || created_by || null;

    const { rows } = await pool.query(
      `UPDATE crm_campaigns SET name=$1, type=$2, status=$3, created_by=$4, recipients=$5, subject=$6, body=$7, cc=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, type || 'Email', status || 'Draft', createdByVal, recipients || 0, subject || null, body || null, cc || null, req.params.id]
    );
    res.json({ success: true, campaign: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_campaigns WHERE id=$1', [req.params.id]);
    const campaign = rows[0];
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if ((campaign.type || 'Email') !== 'Email') return res.status(400).json({ error: 'Only Email campaigns can be sent.' });
    if (!campaign.subject) return res.status(400).json({ error: 'Campaign subject is required before sending.' });
    if (!campaign.body) return res.status(400).json({ error: 'Campaign body is required before sending.' });

    const setupError = emailSetupError();
    if (setupError) return res.status(400).json({ error: setupError });

    const filterSql = campaignLeadFilterSql(req.body?.recipientGroup);
    const leadResult = await pool.query(
      `SELECT name, email FROM crm_leads
       WHERE COALESCE(email, '') <> ''
       AND LOWER(COALESCE(status, '')) <> 'deleted'${filterSql}
       ORDER BY created_at DESC`
    );
    const seen = new Set();
    const recipients = leadResult.rows
      .map((lead) => String(lead.email || '').trim())
      .filter((email) => {
        const key = email.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No lead email addresses found for this campaign recipient group.' });
    }

    const sent = await safeSendMail({
      from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      cc: campaign.cc || undefined,
      bcc: recipients.join(','),
      subject: campaign.subject,
      html: campaign.body,
    });
    if (!sent) return res.status(500).json({ error: 'Email sending failed. Check backend email credentials and logs.' });

    const updated = await pool.query(
      `UPDATE crm_campaigns SET status='Active', recipients=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [recipients.length, req.params.id]
    );
    res.json({ success: true, campaign: updated.rows[0], sentCount: recipients.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/campaigns/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_campaigns WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENHANCED PROPOSALS ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/proposals', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    const { rows } = await pool.query('SELECT * FROM crm_proposals ORDER BY created_at DESC');
    res.json({ success: true, proposals: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/proposals', async (req, res) => {
  try {
    const { lead, lead_name, subject, sentBy, sent_by, value, status, dueDate, due_date, cc, bcc, body } = req.body;
    const leadVal = lead || lead_name || null;
    const sentByVal = sentBy || sent_by || null;
    const dueDateVal = dueDate || due_date || null;

    const { rows } = await pool.query(
      `INSERT INTO crm_proposals (lead_name, subject, sent_by, value, status, due_date, cc, bcc, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [leadVal, subject, sentByVal, value || 0, status || 'Draft', dueDateVal, cc || null, bcc || null, body || null]
    );
    await runProposalAutomation(rows[0]);
    res.json({ success: true, proposal: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/proposals/:id', async (req, res) => {
  try {
    const { lead, lead_name, subject, sentBy, sent_by, value, status, dueDate, due_date, cc, bcc, body } = req.body;
    const leadVal = lead || lead_name || null;
    const sentByVal = sentBy || sent_by || null;
    const dueDateVal = dueDate || due_date || null;
    const current = await pool.query('SELECT status FROM crm_proposals WHERE id=$1', [req.params.id]);
    const previousStatus = current.rows[0]?.status;

    const { rows } = await pool.query(
      `UPDATE crm_proposals SET lead_name=$1, subject=$2, sent_by=$3, value=$4, status=$5, due_date=$6, cc=$7, bcc=$8, body=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [leadVal, subject, sentByVal, value || 0, status, dueDateVal, cc || null, bcc || null, body || null, req.params.id]
    );
    await runProposalAutomation(rows[0], previousStatus);
    res.json({ success: true, proposal: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public proposal endpoints use a random token instead of exposing a proposal id.
router.get('/public/proposals/:token', async (req, res) => {
  try {
    await ensureProposalAutomationColumns();
    const { rows } = await pool.query(
      `UPDATE crm_proposals
       SET first_viewed_at=COALESCE(first_viewed_at, NOW()),
           last_viewed_at=NOW(),
           view_count=COALESCE(view_count, 0) + 1,
           status=CASE WHEN status='Sent' THEN 'Viewed' ELSE status END,
           updated_at=NOW()
       WHERE public_token=$1 AND status <> 'Draft'
       RETURNING id, lead_name, subject, value, status, due_date, body,
                 first_viewed_at, last_viewed_at, view_count`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Proposal link is invalid or no longer available.' });
    res.json({ success: true, proposal: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Unable to open this proposal.' });
  }
});

router.post('/public/proposals/:token/respond', async (req, res) => {
  try {
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!['accept', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Choose accept or reject.' });
    }
    const nextStatus = decision === 'accept' ? 'Accepted' : 'Rejected';
    const current = await pool.query('SELECT * FROM crm_proposals WHERE public_token=$1', [req.params.token]);
    const proposal = current.rows[0];
    if (!proposal) return res.status(404).json({ error: 'Proposal link is invalid.' });
    if (['Accepted', 'Rejected', 'Expired'].includes(proposal.status)) {
      return res.json({ success: true, proposal: { status: proposal.status } });
    }
    const { rows } = await pool.query(
      `UPDATE crm_proposals
       SET status=$1, responded_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND status IN ('Sent', 'Viewed')
       RETURNING *`,
      [nextStatus, proposal.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'This proposal can no longer be updated.' });
    await runProposalAutomation(rows[0], proposal.status);
    res.json({ success: true, proposal: { status: rows[0].status } });
  } catch (err) {
    res.status(500).json({ error: 'Unable to save your response.' });
  }
});

// SEND PROPOSAL — emails a secure proposal link and marks it Sent
router.post('/proposals/:id/send', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_proposals WHERE id=$1', [req.params.id]);
    const proposal = rows[0];
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    const leadResult = await pool.query(
      'SELECT email FROM crm_leads WHERE id::text=$1 LIMIT 1',
      [proposal.lead_id]
    );
    const toEmail = leadResult.rows[0]?.email;
    if (!toEmail) {
      return res.status(400).json({ error: "This lead has no email address saved. Add one before sending." });
    }

    const setupError = emailSetupError();
    if (setupError) {
      return res.status(400).json({ error: setupError });
    }

    const publicToken = proposal.public_token || crypto.randomBytes(32).toString('hex');
    const publicUrl = proposalPublicUrl(publicToken);
    const sent = await safeSendMail({
      from: `"Manod Technologies" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      cc: proposal.cc || undefined,
      bcc: proposal.bcc || undefined,
      subject: proposal.subject,
      html: proposalEmailHtml(proposal, publicUrl),
    });
    if (!sent) {
      return res.status(500).json({ error: 'Email could not be sent. Check backend email settings and try again.' });
    }

    const { rows: updated } = await pool.query(
      `UPDATE crm_proposals
       SET status='Sent', public_token=$2, sent_at=NOW(),
           first_viewed_at=NULL, last_viewed_at=NULL, view_count=0,
           followup_1_sent_at=NULL, call_task_created_at=NULL,
           final_reminder_sent_at=NULL, responded_at=NULL, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, publicToken]
    );
    await runProposalAutomation(updated[0], proposal.status);

    res.json({ success: true, proposal: updated[0] });
  } catch (err) {
    console.error('sendProposal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/proposals/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_proposals WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENHANCED CONTACTS ROUTES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_contacts ORDER BY created_at DESC');
    res.json({ success: true, contacts: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/contacts', async (req, res) => {
  try {
    const { firstName, first_name, lastName, last_name, email, mobile, department, designation,
             linkedLead, linked_lead, active, is_active, phone, altPhone, alt_phone,
             lifeStage, life_stage, salesCommission, sales_commission } = req.body;

    const firstNameVal = firstName || first_name || null;
    const lastNameVal = lastName || last_name || null;
    const linkedLeadInput = linkedLead || linked_lead || null;
    const linkedLeadVal = await resolveLinkedLeadName(linkedLeadInput);
    if (linkedLeadInput && !linkedLeadVal) return res.status(400).json({ error: 'Linked lead not found. Select an existing lead or leave it blank.' });
    const lifeStageVal = lifeStage || life_stage || null;
    const activeVal = active !== undefined ? active : (is_active !== undefined ? is_active : true);

    const { rows } = await pool.query(
      `INSERT INTO crm_contacts (first_name, last_name, email, mobile, department, designation, linked_lead,
                                  is_active, phone, alt_phone, life_stage, sales_commission)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [firstNameVal, lastNameVal, email, mobile || null, department || null, designation || null,
       linkedLeadVal, activeVal, phone || null, altPhone || alt_phone || null,
       lifeStageVal || null, salesCommission || sales_commission || null]
    );
    res.json({ success: true, contact: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/contacts/:id', async (req, res) => {
  try {
    const { firstName, first_name, lastName, last_name, email, mobile, department, designation,
             linkedLead, linked_lead, active, is_active, phone, altPhone, alt_phone,
             lifeStage, life_stage, salesCommission, sales_commission } = req.body;

    const firstNameVal = firstName || first_name || null;
    const lastNameVal = lastName || last_name || null;
    const linkedLeadInput = linkedLead || linked_lead || null;
    const linkedLeadVal = await resolveLinkedLeadName(linkedLeadInput);
    if (linkedLeadInput && !linkedLeadVal) return res.status(400).json({ error: 'Linked lead not found. Select an existing lead or leave it blank.' });
    const lifeStageVal = lifeStage || life_stage || null;
    const activeVal = active !== undefined ? active : (is_active !== undefined ? is_active : true);

    const { rows } = await pool.query(
      `UPDATE crm_contacts SET first_name=$1, last_name=$2, email=$3, mobile=$4, department=$5,
                               designation=$6, linked_lead=$7, is_active=$8, phone=$9, alt_phone=$10,
                               life_stage=$11, sales_commission=$12, updated_at=NOW() WHERE id=$13 RETURNING *`,
      [firstNameVal, lastNameVal, email, mobile || null, department || null, designation || null,
       linkedLeadVal, activeVal, phone || null, altPhone || alt_phone || null,
       lifeStageVal || null, salesCommission || sales_commission || null, req.params.id]
    );
    res.json({ success: true, contact: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/contacts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_contacts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TEMPLATES ROUTES (unchanged)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_templates ORDER BY updated_at DESC');
    res.json({ success: true, templates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, subject, description, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO crm_templates (name, subject, description, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, subject, description || null, status || 'Active']
    );
    res.json({ success: true, template: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, subject, description, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE crm_templates SET name=$1, subject=$2, description=$3, status=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, subject, description || null, status, req.params.id]
    );
    res.json({ success: true, template: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_templates WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


// PAYMENT REMINDER ROUTES
router.get('/payment-reminders', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    await ensurePaymentReminderTable();
    const { rows: acceptedRows } = await pool.query(
      `SELECT l.*, p.id AS proposal_id, p.value AS proposal_value, p.status AS proposal_status
       FROM crm_leads l
       JOIN crm_proposals p ON p.lead_id = l.id::text
       WHERE l.stage='Won' AND p.status='Accepted'
       ORDER BY l.id, p.updated_at DESC NULLS LAST, p.id DESC`
    );
    for (const row of acceptedRows) {
      await ensurePaymentReminderForProposal(
        { id: row.proposal_id, lead_name: row.name, value: row.proposal_value, status: row.proposal_status },
        row
      );
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (pr.id) pr.*
       FROM crm_payment_reminders pr
       JOIN crm_leads l ON pr.lead_id = l.id::text
       JOIN crm_proposals p ON pr.proposal_id = p.id::text AND p.status = 'Accepted'
       ORDER BY pr.id, pr.updated_at DESC`
    );
    res.json({ success: true, paymentReminders: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/payment-reminders/:id', async (req, res) => {
  try {
    await ensurePaymentReminderTable();
    const { currentStage, current_stage, status, notes, assigned, dueDate, due_date } = req.body;
    const stage = currentStage || current_stage || PAYMENT_REMINDER_STAGES[0];
    if (!PAYMENT_REMINDER_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid payment reminder stage.' });

    const current = await pool.query('SELECT * FROM crm_payment_reminders WHERE id=$1', [req.params.id]);
    const existing = current.rows[0];
    if (!existing) return res.status(404).json({ error: 'Payment reminder not found' });

    const stageChanged = existing.current_stage !== stage;
    const history = Array.isArray(existing.stage_history) ? existing.stage_history : [];
    const nextHistory = !stageChanged
      ? history
      : [...history, { stage, date: new Date().toISOString(), note: 'Payment stage updated manually.' }];
    const isPaid = stage === 'Payment Received';
    const nextStatus = status || (isPaid ? 'Completed' : 'Pending');
    const paidAt = isPaid ? 'NOW()' : 'NULL';

    const { rows } = await pool.query(
      `UPDATE crm_payment_reminders SET
        current_stage=$1, status=$2, notes=$3, assigned=$4, due_date=$5,
        stage_history=$6, paid_at=${paidAt}, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [stage, nextStatus, notes ?? existing.notes, assigned || existing.assigned, dueDate || due_date || existing.due_date, jsonValue(nextHistory, []), req.params.id]
    );

    const reminder = rows[0];
    const paymentEmailSent = stageChanged ? await sendPaymentReminderStageEmail(reminder, stage) : false;
    let customerSuccess = null;
    if (isPaid) {
      const leadResult = await pool.query(
        'SELECT * FROM crm_leads WHERE id::text=$1 LIMIT 1',
        [reminder.lead_id || null]
      );
      const lead = leadResult.rows[0] || {
        id: reminder.lead_id,
        name: reminder.lead_name,
        company: reminder.company,
        email: reminder.email,
        mobile: reminder.phone,
        assigned: reminder.assigned,
        stage: 'Won',
      };
      customerSuccess = await ensureCustomerSuccessJourney(lead);
    }
    res.json({ success: true, paymentReminder: reminder, automation: { paymentEmailSent, customerSuccessStarted: !!customerSuccess } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CUSTOMER SUCCESS ROUTES
router.get('/customer-success', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    await ensurePaymentReminderTable();
    await ensureCustomerSuccessTable();

    const { rows: paidLeads } = await pool.query(
      `SELECT DISTINCT ON (l.id) l.*
       FROM crm_leads l
       JOIN crm_payment_reminders pr ON pr.lead_id = l.id::text
       WHERE l.stage='Won' AND pr.current_stage='Payment Received'
       ORDER BY l.id, pr.updated_at DESC NULLS LAST, pr.id DESC`
    );

    for (const lead of paidLeads) {
      await pool.query(
        `UPDATE crm_payment_reminders
         SET status='Completed', paid_at=COALESCE(paid_at, NOW()), updated_at=NOW()
         WHERE current_stage='Payment Received'
           AND status <> 'Completed'
           AND lead_id=$1`,
        [String(lead.id)]
      );
      await ensureCustomerSuccessJourney(lead);
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (cs.id) cs.*
       FROM crm_customer_success cs
       JOIN crm_leads l ON cs.lead_id = l.id::text
       JOIN crm_payment_reminders pr ON pr.lead_id = l.id::text
       WHERE l.stage='Won' AND pr.status='Completed'
       ORDER BY cs.id, cs.updated_at DESC`
    );
    res.json({ success: true, customerSuccess: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/customer-success/from-lead/:leadId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM crm_leads WHERE id=$1', [req.params.leadId]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.stage !== 'Won') return res.status(400).json({ error: 'Customer Success can be created only for leads in Won stage.' });
    const paid = await pool.query(
      `SELECT id FROM crm_payment_reminders
       WHERE status='Completed' AND lead_id=$1
       LIMIT 1`,
      [String(lead.id)]
    );
    if (!paid.rows.length) return res.status(400).json({ error: 'Customer Success starts only after payment is received.' });
    const journey = await ensureCustomerSuccessJourney(lead);
    res.json({ success: true, customerSuccess: journey });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/customer-success/:id', async (req, res) => {
  try {
    await ensureCustomerSuccessTable();
    const { currentStage, current_stage, status, notes, assigned, dueDate, due_date } = req.body;
    const stage = currentStage || current_stage || CUSTOMER_SUCCESS_STAGES[0];
    const current = await pool.query('SELECT * FROM crm_customer_success WHERE id=$1', [req.params.id]);
    const existing = current.rows[0];
    if (!existing) return res.status(404).json({ error: 'Customer success record not found' });

    const stageChanged = existing.current_stage !== stage;
    const history = Array.isArray(existing.stage_history) ? existing.stage_history : [];
    const nextHistory = !stageChanged
      ? history
      : [...history, { stage, date: new Date().toISOString(), note: 'Stage updated manually.' }];
    const isCompletedStage = stage === CUSTOMER_SUCCESS_STAGES[CUSTOMER_SUCCESS_STAGES.length - 1];
    const nextStatus = status || (isCompletedStage ? 'Completed' : 'Active');
    const completedAt = isCompletedStage ? 'NOW()' : 'NULL';

    const { rows } = await pool.query(
      `UPDATE crm_customer_success SET
        current_stage=$1, status=$2, notes=$3, assigned=$4, due_date=$5,
        stage_history=$6, completed_at=${completedAt}, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [stage, nextStatus, notes ?? existing.notes, assigned || existing.assigned, dueDate || due_date || existing.due_date, jsonValue(nextHistory, []), req.params.id]
    );
    const customerEmailSent = stageChanged ? await sendCustomerSuccessStageEmail(rows[0], stage) : false;
    res.json({ success: true, customerSuccess: rows[0], automation: { customerEmailSent } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// INSTALLED MACHINES & AFTER-SALES SERVICE
router.get('/machines', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const { rows } = await pool.query(`
      SELECT m.*, COUNT(s.id)::int AS service_count, MAX(s.service_date) AS last_service_date
      FROM crm_installed_machines m
      LEFT JOIN crm_machine_services s ON s.machine_id=m.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, machines: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/machines', authenticateToken, requirePermission('Machine Service', 'Add machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const b = req.body || {};
    const linkedLeadId = b.leadId || b.lead_id || null;
    if (!linkedLeadId) return res.status(400).json({ error: 'Select a customer from Customer Success.' });
    const customerSuccess = await pool.query(`SELECT id FROM crm_customer_success WHERE lead_id=$1 LIMIT 1`, [String(linkedLeadId)]);
    if (!customerSuccess.rows.length) return res.status(400).json({ error: 'Installed machines can be added only for customers in Customer Success.' });
    if (!b.customerName && !b.customer_name) return res.status(400).json({ error: 'Customer is required.' });
    if (!b.machineModel && !b.machine_model) return res.status(400).json({ error: 'Machine model is required.' });
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const { rows } = await pool.query(
      `INSERT INTO crm_installed_machines
       (lead_id, customer_name, machine_model, serial_number, installation_date, warranty_start,
        warranty_end, next_maintenance, spare_requirement, amc_status, amc_start, amc_end,
        location, assigned_user_id, assigned, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [linkedLeadId, b.customerName || b.customer_name, b.machineModel || b.machine_model,
       b.serialNumber || b.serial_number || null, b.installationDate || b.installation_date || null,
       b.warrantyStart || b.warranty_start || null, b.warrantyEnd || b.warranty_end || null,
       b.nextMaintenance || b.next_maintenance || null, b.spareRequirement || b.spare_requirement || null,
       b.amcStatus || b.amc_status || 'Not Applicable', b.amcStart || b.amc_start || null,
       b.amcEnd || b.amc_end || null, b.location || null, assignedUserId, b.assigned || null,
       b.status || 'Active', b.notes || null]
    );
    res.json({ success: true, machine: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Serial number already exists.' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/machines/:id', authenticateToken, requirePermission('Machine Service', 'Edit machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const b = req.body || {};
    const linkedLeadId = b.leadId || b.lead_id || null;
    if (!linkedLeadId) return res.status(400).json({ error: 'Select a customer from Customer Success.' });
    const customerSuccess = await pool.query(`SELECT id FROM crm_customer_success WHERE lead_id=$1 LIMIT 1`, [String(linkedLeadId)]);
    if (!customerSuccess.rows.length) return res.status(400).json({ error: 'Installed machines can be linked only to customers in Customer Success.' });
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const { rows } = await pool.query(
      `UPDATE crm_installed_machines SET
       lead_id=$1, customer_name=$2, machine_model=$3, serial_number=$4, installation_date=$5,
       warranty_start=$6, warranty_end=$7, next_maintenance=$8, spare_requirement=$9,
       amc_status=$10, amc_start=$11, amc_end=$12, location=$13, assigned_user_id=$14,
       assigned=$15, status=$16, notes=$17, updated_at=NOW() WHERE id=$18 RETURNING *`,
      [linkedLeadId, b.customerName || b.customer_name, b.machineModel || b.machine_model,
       b.serialNumber || b.serial_number || null, b.installationDate || b.installation_date || null,
       b.warrantyStart || b.warranty_start || null, b.warrantyEnd || b.warranty_end || null,
       b.nextMaintenance || b.next_maintenance || null, b.spareRequirement || b.spare_requirement || null,
       b.amcStatus || b.amc_status || 'Not Applicable', b.amcStart || b.amc_start || null,
       b.amcEnd || b.amc_end || null, b.location || null, assignedUserId, b.assigned || null,
       b.status || 'Active', b.notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Machine not found.' });
    res.json({ success: true, machine: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Serial number already exists.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/machines/:id', authenticateToken, requirePermission('Machine Service', 'Delete machine service'), async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_installed_machines WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/machines/:id/services', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const { rows } = await pool.query(`
      SELECT s.*, COUNT(a.id)::int AS attachment_count
      FROM crm_machine_services s
      LEFT JOIN crm_machine_service_attachments a ON a.service_id=s.id
      WHERE s.machine_id=$1 GROUP BY s.id ORDER BY s.service_date DESC, s.id DESC`, [req.params.id]);
    res.json({ success: true, services: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/machines/:id/services', authenticateToken, requirePermission('Machine Service', 'Add machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const b = req.body || {};
    if (!b.serviceDate && !b.service_date) return res.status(400).json({ error: 'Service date is required.' });
    const rating = b.customerRating || b.customer_rating || null;
    if (rating && (Number(rating) < 1 || Number(rating) > 5)) return res.status(400).json({ error: 'Customer rating must be between 1 and 5.' });
    const downtimeStart = b.downtimeStart || b.downtime_start || null;
    const downtimeEnd = b.downtimeEnd || b.downtime_end || null;
    const downtimeMinutes = downtimeStart && downtimeEnd
      ? Math.max(0, Math.round((new Date(downtimeEnd).getTime() - new Date(downtimeStart).getTime()) / 60000)) : 0;
    const laborCost = Number(b.laborCost || b.labor_cost) || 0;
    const spareCost = Number(b.spareCost || b.spare_cost) || 0;
    const travelCost = Number(b.travelCost || b.travel_cost) || 0;
    const totalCost = laborCost + spareCost + travelCost;
    const { rows } = await pool.query(
      `INSERT INTO crm_machine_services
       (machine_id, service_date, service_type, issue_reported, work_performed, spare_used,
        technician, next_service_date, status, cost, notes, service_category, assigned_technician_id,
        customer_contact_name, customer_contact_phone, coverage_status, resolution_status,
        labor_cost, spare_cost, travel_cost, downtime_start, downtime_end, downtime_minutes,
        customer_confirmation_name, customer_feedback, customer_rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [req.params.id, b.serviceDate || b.service_date, b.serviceType || b.service_type || 'Preventive Maintenance',
       b.issueReported || b.issue_reported || null, b.workPerformed || b.work_performed || null,
       b.spareUsed || b.spare_used || null, b.technician || null,
       b.nextServiceDate || b.next_service_date || null, b.status || 'Completed', totalCost, b.notes || null,
       b.serviceCategory || b.service_category || b.serviceType || b.service_type || 'Preventive Maintenance',
       b.assignedTechnicianId || b.assigned_technician_id || null,
       b.customerContactName || b.customer_contact_name || null, b.customerContactPhone || b.customer_contact_phone || null,
       b.coverageStatus || b.coverage_status || 'Chargeable', b.resolutionStatus || b.resolution_status || 'Resolved',
       laborCost, spareCost, travelCost, downtimeStart, downtimeEnd, downtimeMinutes,
       b.customerConfirmationName || b.customer_confirmation_name || null, b.customerFeedback || b.customer_feedback || null,
       rating ? Number(rating) : null]
    );
    if (b.nextServiceDate || b.next_service_date) {
      await pool.query('UPDATE crm_installed_machines SET next_maintenance=$1, updated_at=NOW() WHERE id=$2', [b.nextServiceDate || b.next_service_date, req.params.id]);
    }
    // A chargeable completed visit sends the customer a single charge notice.
    // The automation log prevents duplicate messages if the request is retried.
    if ((b.status || 'Completed') === 'Completed'
      && String(b.coverageStatus || b.coverage_status || 'Chargeable').toLowerCase() === 'chargeable'
      && totalCost > 0) {
      try {
        const { rows: machineRows } = await pool.query(`
          SELECT m.customer_name, m.machine_model, l.email AS customer_email
          FROM crm_installed_machines m
          LEFT JOIN crm_leads l ON l.id::text=m.lead_id
          WHERE m.id=$1
        `, [req.params.id]);
        const machine = machineRows[0];
        if (machine?.customer_email) {
          const formatCharge = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
          const amount = formatCharge(totalCost);
          const costLines = [
            laborCost > 0 ? `<li>Labour: ${formatCharge(laborCost)}</li>` : '',
            spareCost > 0 ? `<li>Spares: ${formatCharge(spareCost)}</li>` : '',
            travelCost > 0 ? `<li>Travel: ${formatCharge(travelCost)}</li>` : '',
          ].filter(Boolean).join('');
          await deliverMachineAlert({
            eventKey: `machine-service-charge-${rows[0].id}`,
            to: machine.customer_email,
            subject: `Service charge notice - ${machine.machine_model}`,
            html: `<p>Dear ${escapeHtml(machine.customer_name)},</p><p>Your service visit for <strong>${escapeHtml(machine.machine_model)}</strong> on ${escapeHtml(String(b.serviceDate || b.service_date))} has been completed.</p><p><strong>Total service charge: ${escapeHtml(amount)}</strong></p>${costLines ? `<ul>${costLines}</ul>` : ''}<p>Please contact us if you need any clarification.</p><p>Regards,<br/>Manod CRM</p>`,
          });
        }
      } catch (mailErr) {
        // The service record must remain saved even when mail delivery is unavailable.
        console.error('service charge notice failed:', mailErr.message);
      }
    }
    res.json({ success: true, service: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/machine-services/:id', authenticateToken, requirePermission('Machine Service', 'Delete machine service'), async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_machine_services WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/machine-services/:id/attachments', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, service_id, file_name, mime_type, file_size, created_at FROM crm_machine_service_attachments WHERE service_id=$1 ORDER BY created_at DESC`, [req.params.id]);
    res.json({ success: true, attachments: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/machine-services/:id/attachments', authenticateToken, requirePermission('Machine Service', 'Add machine service'), async (req, res) => {
  try {
    const { fileName, mimeType, base64Data } = req.body || {};
    if (!fileName || !mimeType || !base64Data) return res.status(400).json({ error: 'Attachment file data is required.' });
    const fileData = Buffer.from(String(base64Data).replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!fileData.length) return res.status(400).json({ error: 'Attachment is empty.' });
    if (fileData.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Attachment must be 5 MB or smaller.' });
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Only PDF, JPG, PNG and WebP attachments are allowed.' });
    const { rows } = await pool.query(`INSERT INTO crm_machine_service_attachments (service_id,file_name,mime_type,file_size,file_data,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,service_id,file_name,mime_type,file_size,created_at`, [req.params.id, fileName, mimeType, fileData.length, fileData, String(req.user?.id || '') || null]);
    res.json({ success: true, attachment: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/machine-service-attachments/:id/download', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT file_name,mime_type,file_data FROM crm_machine_service_attachments WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Attachment not found.' });
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${String(rows[0].file_name).replace(/["\r\n]/g, '')}"`);
    res.send(rows[0].file_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/machine-consumables', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const { rows } = await pool.query(`SELECT * FROM crm_machine_consumables ORDER BY next_requirement_date NULLS LAST, created_at DESC`);
    res.json({ success: true, consumables: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const consumableNextRequirement = (body) => {
  if (body.nextRequirementDate || body.next_requirement_date) return body.nextRequirementDate || body.next_requirement_date;
  const supplied = body.lastSuppliedDate || body.last_supplied_date;
  if (!supplied) return null;
  const date = new Date(`${supplied}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + (Math.max(1, Number(body.frequencyDays || body.frequency_days) || 30)));
  return date.toISOString().slice(0, 10);
};

router.post('/machine-consumables', authenticateToken, requirePermission('Machine Service', 'Add machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const b = req.body || {};
    if (!b.customerName && !b.customer_name) return res.status(400).json({ error: 'Customer is required.' });
    if (!b.itemName && !b.item_name) return res.status(400).json({ error: 'Consumable item is required.' });
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const nextRequirementDate = consumableNextRequirement(b);
    const { rows } = await pool.query(
      `INSERT INTO crm_machine_consumables
       (machine_id, lead_id, customer_name, item_name, category, quantity, unit, reorder_level,
        last_supplied_date, next_requirement_date, unit_price, status, notes, sku, brand, specification,
        supply_type, order_invoice_number, purchase_cost, tax_percent, last_supplied_quantity,
        consumption_frequency, frequency_days, assigned_user_id, assigned, opportunity_status,
        customer_contact_name, customer_contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
      [b.machineId || b.machine_id || null, b.leadId || b.lead_id || null, b.customerName || b.customer_name,
       b.itemName || b.item_name, b.category || 'Consumable', Number(b.quantity) || 0, b.unit || 'Nos',
       Number(b.reorderLevel || b.reorder_level) || 0, b.lastSuppliedDate || b.last_supplied_date || null,
       nextRequirementDate, Number(b.unitPrice || b.unit_price) || 0, b.status || 'Active', b.notes || null,
       b.sku || null, b.brand || null, b.specification || null, b.supplyType || b.supply_type || 'Sale',
       b.orderInvoiceNumber || b.order_invoice_number || null, Number(b.purchaseCost || b.purchase_cost) || 0,
       Number(b.taxPercent || b.tax_percent) || 0, Number(b.lastSuppliedQuantity || b.last_supplied_quantity) || 0,
       b.consumptionFrequency || b.consumption_frequency || 'Monthly', Math.max(1, Number(b.frequencyDays || b.frequency_days) || 30),
       assignedUserId, b.assigned || null, b.opportunityStatus || b.opportunity_status || 'Reminder Due',
       b.customerContactName || b.customer_contact_name || null, b.customerContactPhone || b.customer_contact_phone || null]
    );
    res.json({ success: true, consumable: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/machine-consumables/:id', authenticateToken, requirePermission('Machine Service', 'Edit machine service'), async (req, res) => {
  try {
    const b = req.body || {};
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const nextRequirementDate = consumableNextRequirement(b);
    const { rows } = await pool.query(
      `UPDATE crm_machine_consumables SET machine_id=$1, lead_id=$2, customer_name=$3, item_name=$4,
       category=$5, quantity=$6, unit=$7, reorder_level=$8, last_supplied_date=$9,
       next_requirement_date=$10, unit_price=$11, status=$12, notes=$13, sku=$14, brand=$15,
       specification=$16, supply_type=$17, order_invoice_number=$18, purchase_cost=$19,
       tax_percent=$20, last_supplied_quantity=$21, consumption_frequency=$22, frequency_days=$23,
       assigned_user_id=$24, assigned=$25, opportunity_status=$26, customer_contact_name=$27,
       customer_contact_phone=$28, updated_at=NOW() WHERE id=$29 RETURNING *`,
      [b.machineId || b.machine_id || null, b.leadId || b.lead_id || null, b.customerName || b.customer_name,
       b.itemName || b.item_name, b.category || 'Consumable', Number(b.quantity) || 0, b.unit || 'Nos',
       Number(b.reorderLevel || b.reorder_level) || 0, b.lastSuppliedDate || b.last_supplied_date || null,
       nextRequirementDate, Number(b.unitPrice || b.unit_price) || 0, b.status || 'Active', b.notes || null,
       b.sku || null, b.brand || null, b.specification || null, b.supplyType || b.supply_type || 'Sale',
       b.orderInvoiceNumber || b.order_invoice_number || null, Number(b.purchaseCost || b.purchase_cost) || 0,
       Number(b.taxPercent || b.tax_percent) || 0, Number(b.lastSuppliedQuantity || b.last_supplied_quantity) || 0,
       b.consumptionFrequency || b.consumption_frequency || 'Monthly', Math.max(1, Number(b.frequencyDays || b.frequency_days) || 30),
       assignedUserId, b.assigned || null, b.opportunityStatus || b.opportunity_status || 'Reminder Due',
       b.customerContactName || b.customer_contact_name || null, b.customerContactPhone || b.customer_contact_phone || null,
       req.params.id]
    );
    res.json({ success: true, consumable: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/machine-consumables/:id', authenticateToken, requirePermission('Machine Service', 'Delete machine service'), async (req, res) => {
  try { await pool.query('DELETE FROM crm_machine_consumables WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/machine-replacements', authenticateToken, requirePermission('Machine Service', 'View machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const { rows } = await pool.query(`SELECT * FROM crm_machine_replacement_opportunities ORDER BY created_at DESC`);
    res.json({ success: true, replacements: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/machine-replacements', authenticateToken, requirePermission('Machine Service', 'Add machine service'), async (req, res) => {
  try {
    await ensureMachineServiceTables();
    const b = req.body || {};
    if (!b.customerName && !b.customer_name) return res.status(400).json({ error: 'Customer is required.' });
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const { rows } = await pool.query(
      `INSERT INTO crm_machine_replacement_opportunities
       (machine_id, lead_id, customer_name, current_model, replacement_reason, proposed_model,
        expected_purchase_date, estimated_value, stage, assigned_user_id, assigned, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [b.machineId || b.machine_id || null, b.leadId || b.lead_id || null, b.customerName || b.customer_name,
       b.currentModel || b.current_model || null, b.replacementReason || b.replacement_reason || null,
       b.proposedModel || b.proposed_model || null, b.expectedPurchaseDate || b.expected_purchase_date || null,
       Number(b.estimatedValue || b.estimated_value) || 0, b.stage || 'New', assignedUserId,
       b.assigned || null, b.status || 'Open', b.notes || null]
    );
    res.json({ success: true, replacement: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/machine-replacements/:id', authenticateToken, requirePermission('Machine Service', 'Edit machine service'), async (req, res) => {
  try {
    const b = req.body || {};
    const assignedUserId = await resolveAssignedUserId(b.assigned, b.assignedUserId || b.assigned_user_id);
    const { rows } = await pool.query(
      `UPDATE crm_machine_replacement_opportunities SET machine_id=$1, lead_id=$2, customer_name=$3,
       current_model=$4, replacement_reason=$5, proposed_model=$6, expected_purchase_date=$7,
       estimated_value=$8, stage=$9, assigned_user_id=$10, assigned=$11, status=$12,
       notes=$13, updated_at=NOW() WHERE id=$14 RETURNING *`,
      [b.machineId || b.machine_id || null, b.leadId || b.lead_id || null, b.customerName || b.customer_name,
       b.currentModel || b.current_model || null, b.replacementReason || b.replacement_reason || null,
       b.proposedModel || b.proposed_model || null, b.expectedPurchaseDate || b.expected_purchase_date || null,
       Number(b.estimatedValue || b.estimated_value) || 0, b.stage || 'New', assignedUserId,
       b.assigned || null, b.status || 'Open', b.notes || null, req.params.id]
    );
    res.json({ success: true, replacement: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/machine-replacements/:id', authenticateToken, requirePermission('Machine Service', 'Delete machine service'), async (req, res) => {
  try { await pool.query('DELETE FROM crm_machine_replacement_opportunities WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/settings', async (_req, res) => {
  try {
    await ensureCrmSettingsTable();
    const { rows } = await pool.query(`SELECT * FROM crm_settings WHERE id=1`);
    res.json({ success: true, settings: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', async (req, res) => {
  try {
    await ensureCrmSettingsTable();
    const body = req.body || {};
    const companyName = String(body.companyName || body.company_name || '').trim();
    if (!companyName) return res.status(400).json({ error: 'Company name is required.' });
    const { rows } = await pool.query(`
      UPDATE crm_settings SET company_name=$1, currency=$2, default_assigned=$3,
        default_stage=$4, default_source=$5, crm_industry=$6, updated_by=$7, updated_at=NOW()
      WHERE id=1 RETURNING *`,
    [companyName, body.currency || 'INR', body.defaultAssigned || body.default_assigned || null,
      body.defaultStage || body.default_stage || 'New', body.defaultSource || body.default_source || 'Website',
      ['general','machine','export','real_estate'].includes(body.crmIndustry || body.crm_industry) ? (body.crmIndustry || body.crm_industry) : 'general', String(req.user?.id || '') || null]);
    res.json({ success: true, settings: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DASHBOARD STATS ROUTE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/dashboard/stats', async (req, res) => {
  try {
    await cleanupOrphanLeadRecords();
    const [leads, followups, proposals] = await Promise.all([
      pool.query('SELECT stage, converted FROM crm_leads'),
      pool.query('SELECT status FROM crm_followups'),
      pool.query('SELECT status, value FROM crm_proposals'),
    ]);
    res.json({ success: true, leads: leads.rows, followups: followups.rows, proposals: proposals.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

let proposalAutomationRunning = false;
let dailyDigestRunning = false;
const runProposalAutomationCycle = async () => {
  if (proposalAutomationRunning) return;
  proposalAutomationRunning = true;
  try {
    await processProposalEngagements();
  } catch (err) {
    console.error('proposal engagement automation failed:', err.message);
  } finally {
    proposalAutomationRunning = false;
  }
};

const runDailyDigestCycle = async () => {
  const india = indiaNowParts();
  if (india.hour !== 9 || dailyDigestRunning) return;
  dailyDigestRunning = true;
  try {
    await processMachineServiceAutomations(india.date);
    await processExportPaymentReminders(india.date);
    await sendDailyFollowupDigests(india.date);
  } catch (err) {
    console.error('daily CRM automation failed:', err.message);
  } finally {
    dailyDigestRunning = false;
  }
};

if (process.env.NODE_ENV !== 'test' && process.env.AUTOMATIONS_ENABLED === 'true') {
  const intervalMinutes = Math.max(1, Number(process.env.PROPOSAL_AUTOMATION_INTERVAL_MINUTES) || 15);
  setTimeout(runProposalAutomationCycle, 10000);
  setInterval(runProposalAutomationCycle, intervalMinutes * 60 * 1000);
  setTimeout(runDailyDigestCycle, 15000);
  setInterval(runDailyDigestCycle, 60 * 1000);
}

// Export sales workspace: vendors, catalogue, buyer RFQs and export quotations.
const exportEntityConfig = {
  vendors: { table: 'export_vendors', fields: ['name','contact_name','email','phone','country','categories','certification','status','notes'] },
  products: { table: 'export_products', fields: ['name','category','hs_code','specification','certification','currency','unit_price','unit','status'] },
  rfqs: { table: 'export_rfqs', fields: ['reference_no','buyer_name','buyer_email','product_id','quantity','unit','incoterm','destination_country','required_by','status','notes'] },
  quotations: { table: 'export_quotations', fields: ['quotation_no','rfq_id','buyer_name','buyer_email','currency','amount','incoterm','validity_date','status','notes'] },
  orders: { table: 'export_orders', fields: ['order_no','quotation_id','buyer_name','buyer_email','product_summary','order_value','currency','incoterm','stage','production_status','expected_shipment','container_no','destination_country','notes'] },
  shipments: { table: 'export_shipments', fields: ['shipment_no','order_id','buyer_name','container_no','vessel_name','port_of_loading','port_of_discharge','etd','eta','status','milestone','notes'] },
  documents: { table: 'export_documents', fields: ['document_no','order_id','shipment_id','document_type','buyer_name','document_date','status','notes'] },
  payments: { table: 'export_payments', fields: ['payment_ref','order_id','buyer_name','payment_type','payment_mode','currency','invoice_amount','received_amount','due_date','received_date','status','lc_number','notes'] },
  properties: { table: 'real_estate_properties', fields: ['project_name','property_name','property_type','location','price','status','bedrooms','area','notes'] },
  site_visits: { table: 'real_estate_site_visits', fields: ['lead_name','property_id','visit_date','status','assigned','notes'] },
  bookings: { table: 'real_estate_bookings', fields: ['booking_no','lead_name','property_id','token_amount','booking_date','status','agreement_status','notes'] },
  real_estate_payments: { table: 'real_estate_payments', fields: ['receipt_no','booking_id','customer_name','installment_name','amount_due','amount_received','due_date','received_date','status','notes'] },
  brokers: { table: 'real_estate_brokers', fields: ['name','company','phone','email','commission_percent','status','notes'] },
  purchase_enquiries: { table: 'export_purchase_enquiries', fields: ['enquiry_no','vendor_id','vendor_name','product_name','quantity','unit','required_by','status','quoted_price','currency','notes'] },
  inventory: { table: 'export_inventory', fields: ['product_name','sku','warehouse','batch_no','quantity','reserved_quantity','reorder_level','unit','status','notes'] },
  packing_dispatch: { table: 'export_packing_dispatch', fields: ['dispatch_no','order_id','buyer_name','packing_status','package_count','gross_weight','dispatch_date','status','notes'] },
};

const processExportPaymentReminders = async (today) => {
  await ensureExportSalesTables();
  await ensureMachineServiceTables();
  const { rows } = await pool.query(`
    SELECT id, payment_ref, buyer_name, buyer_email, payment_type, payment_mode, currency,
           invoice_amount, received_amount, due_date
    FROM export_payments
    WHERE LOWER(COALESCE(status, 'pending')) NOT IN ('received', 'cancelled')
      AND due_date IS NOT NULL AND due_date <= $1::date
      AND COALESCE(invoice_amount, 0) > COALESCE(received_amount, 0)
  `, [today]);
  for (const payment of rows) {
    if (!payment.buyer_email) continue;
    const balance = Number(payment.invoice_amount || 0) - Number(payment.received_amount || 0);
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: payment.currency || 'USD', maximumFractionDigits: 2 }).format(balance);
    const overdue = new Date(payment.due_date) < new Date(`${today}T00:00:00`);
    await deliverMachineAlert({
      eventKey: `export-payment-${payment.id}-${today}`,
      to: payment.buyer_email,
      subject: `${overdue ? 'Overdue' : 'Due'} payment reminder - ${payment.payment_ref}`,
      html: `<p>Dear ${escapeHtml(payment.buyer_name)},</p><p>This is a ${overdue ? 'reminder that your payment is overdue' : 'reminder that your payment is due today'} for <strong>${escapeHtml(payment.payment_ref)}</strong>.</p><p>Outstanding amount: <strong>${escapeHtml(amount)}</strong></p><p>Payment type: ${escapeHtml(payment.payment_type || 'Payment')} via ${escapeHtml(payment.payment_mode || 'TT')}.</p><p>Regards,<br/>Raya International Exports</p>`,
    });
  }
};
router.get('/export/:entity', async (req, res) => {
  try {
    await ensureExportSalesTables();
    const config = exportEntityConfig[req.params.entity];
    if (!config) return res.status(404).json({ error: 'Unknown export entity' });
    const { rows } = await pool.query(`SELECT * FROM ${config.table} ORDER BY created_at DESC`);
    res.json({ success: true, items: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/export/:entity', async (req, res) => {
  try {
    await ensureExportSalesTables();
    const config = exportEntityConfig[req.params.entity];
    if (!config) return res.status(404).json({ error: 'Unknown export entity' });
    const body = req.body || {};
    const values = config.fields.map((field) => body[field] ?? body[field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null);
    if (req.params.entity === 'rfqs' && !values[0]) values[0] = `RFQ-${Date.now()}`;
    if (req.params.entity === 'quotations' && !values[0]) values[0] = `QTN-${Date.now()}`;
    if (req.params.entity === 'orders' && !values[0]) values[0] = `ORD-${Date.now()}`;
    if (req.params.entity === 'shipments' && !values[0]) values[0] = `SHP-${Date.now()}`;
    if (req.params.entity === 'documents' && !values[0]) values[0] = `DOC-${Date.now()}`;
    if (req.params.entity === 'payments' && !values[0]) values[0] = `PAY-${Date.now()}`;
    if (req.params.entity === 'bookings' && !values[0]) values[0] = `BKG-${Date.now()}`;
    if (req.params.entity === 'real_estate_payments' && !values[0]) values[0] = `RCT-${Date.now()}`;
    if (req.params.entity === 'purchase_enquiries' && !values[0]) values[0] = `PE-${Date.now()}`;
    if (req.params.entity === 'packing_dispatch' && !values[0]) values[0] = `DSP-${Date.now()}`;
    const placeholders = config.fields.map((_, index) => `$${index + 1}`).join(',');
    const { rows } = await pool.query(`INSERT INTO ${config.table} (${config.fields.join(',')}) VALUES (${placeholders}) RETURNING *`, values);
    res.status(201).json({ success: true, item: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/export/:entity/:id', async (req, res) => {
  try {
    await ensureExportSalesTables();
    const config = exportEntityConfig[req.params.entity];
    if (!config) return res.status(404).json({ error: 'Unknown export entity' });
    const body = req.body || {};
    const values = config.fields.map((field) => body[field] ?? body[field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null);
    const setters = config.fields.map((field, index) => `${field}=$${index + 1}`).join(', ');
    const { rows } = await pool.query(`UPDATE ${config.table} SET ${setters}, updated_at=NOW() WHERE id=$${config.fields.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, item: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/export/:entity/:id', async (req, res) => {
  try {
    const config = exportEntityConfig[req.params.entity];
    if (!config) return res.status(404).json({ error: 'Unknown export entity' });
    await pool.query(`DELETE FROM ${config.table} WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.ready = (async () => {
  await ensureLeadExtraColumns();
  await ensureCrmSettingsTable();
  await ensureProposalAutomationColumns();
  await ensureDailyDigestTable();
  await ensureExportSalesTables();
  await ensureMachineServiceTables();
  await ensureMachineServicePermissions();
  await ensurePaymentReminderTable();
  await ensureCustomerSuccessTable();
  await ensureIndustryDataColumns();
  await require('../services/leadIntegrity')(pool);
})();
router.startDailyEmails = () => {
 if(process.env.NODE_ENV==='test'||process.env.DAILY_FOLLOWUP_EMAIL_ENABLED!=='true')return;
 let busy=false;
 const tick=async()=>{const india=indiaNowParts();if(india.hour!==9||busy)return;busy=true;try{await sendDailyFollowupDigests(india.date);}catch(error){console.error('Daily follow-up digest failed:',error.message);}finally{busy=false;}};
 tick();const timer=setInterval(tick,60000);timer.unref();
};
module.exports = router;

























