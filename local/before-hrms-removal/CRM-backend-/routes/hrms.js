const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hrms_employees (
      id SERIAL PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      department TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
      status TEXT NOT NULL DEFAULT 'Active',
      monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hrms_attendance (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hrms_employees(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
      check_in TIME,
      check_out TIME,
      status TEXT NOT NULL DEFAULT 'Present',
      notes TEXT,
      UNIQUE(employee_id, attendance_date)
    );
    CREATE TABLE IF NOT EXISTS hrms_leave_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hrms_employees(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      reviewed_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hrms_payroll (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hrms_employees(id) ON DELETE CASCADE,
      payroll_month DATE NOT NULL,
      gross_salary NUMERIC(12,2) NOT NULL,
      deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_salary NUMERIC(12,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      paid_at TIMESTAMP,
      UNIQUE(employee_id, payroll_month)
    )
  `);
  // Existing application users become HRMS employees automatically once.
  await pool.query(`
    INSERT INTO hrms_employees (employee_code, name, job_title, department, email, phone, joined_on, status, monthly_salary)
    SELECT 'EMP-U-' || id::text,
           COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1)),
           COALESCE(NULLIF(role, ''), 'Employee'),
           COALESCE(NULLIF(department, ''), 'General'),
           email, phone, created_at::date,
           CASE WHEN LOWER(COALESCE(status, 'active')) = 'active' THEN 'Active' ELSE 'Inactive' END
          ,COALESCE(basic_salary, 0)
    FROM users
    WHERE email IS NOT NULL
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      job_title = EXCLUDED.job_title,
      department = EXCLUDED.department,
      phone = EXCLUDED.phone,
      status = EXCLUDED.status,
      monthly_salary = EXCLUDED.monthly_salary,
      updated_at = NOW()
  `);
};
const ready = ensureSchema();
router.use(async (_req, res, next) => { try { await ready; next(); } catch (e) { console.error('HRMS schema error:', e); res.status(500).json({ error: 'HRMS database setup failed' }); } });
const fail = (res, e) => { console.error('HRMS API error:', e); res.status(500).json({ error: e.message || 'HRMS request failed' }); };
const employeeSelect = `SELECT id, employee_code AS "employeeCode", name, job_title AS role, department, email, phone, joined_on AS joined, status, monthly_salary::float AS salary FROM hrms_employees`;

router.get('/employees', async (_req, res) => { try { const q = await pool.query(`${employeeSelect} ORDER BY employee_code`); res.json({ employees:q.rows }); } catch(e){ fail(res,e); } });
router.post('/employees', async (req,res) => { try {
  const {name,role,department,email,phone,joined,salary}=req.body;
  if(!name||!role||!department||!email) return res.status(400).json({error:'Name, job title, department and email are required'});
  const seq=await pool.query(`SELECT COALESCE(MAX(id),0)+1 AS next FROM hrms_employees`); const code=`EMP-${String(seq.rows[0].next).padStart(3,'0')}`;
  const q=await pool.query(`INSERT INTO hrms_employees(employee_code,name,job_title,department,email,phone,joined_on,monthly_salary) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[code,name,role,department,email,phone||null,joined||new Date(),Number(salary)||0]);
  const result=await pool.query(`${employeeSelect} WHERE id=$1`,[q.rows[0].id]); res.status(201).json({employee:result.rows[0]});
}catch(e){ if(e.code==='23505') return res.status(409).json({error:'Employee email already exists'}); fail(res,e); }});
router.put('/employees/:id', async(req,res)=>{try{const {name,role,department,email,phone,joined,status,salary}=req.body;const q=await pool.query(`UPDATE hrms_employees SET name=COALESCE($1,name),job_title=COALESCE($2,job_title),department=COALESCE($3,department),email=COALESCE($4,email),phone=COALESCE($5,phone),joined_on=COALESCE($6,joined_on),status=COALESCE($7,status),monthly_salary=COALESCE($8,monthly_salary),updated_at=NOW() WHERE id=$9 RETURNING id`,[name,role,department,email,phone,joined,status,salary,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Employee not found'});const result=await pool.query(`${employeeSelect} WHERE id=$1`,[req.params.id]);res.json({employee:result.rows[0]});}catch(e){fail(res,e);}});

router.get('/attendance', async(req,res)=>{try{const date=req.query.date||new Date().toISOString().slice(0,10);const q=await pool.query(`SELECT a.id,a.employee_id AS "employeeId",e.name,e.department,a.attendance_date AS date,a.check_in AS "checkIn",a.check_out AS "checkOut",a.status,a.notes FROM hrms_attendance a JOIN hrms_employees e ON e.id=a.employee_id WHERE a.attendance_date=$1 ORDER BY e.name`,[date]);res.json({attendance:q.rows,date});}catch(e){fail(res,e);}});
router.post('/attendance',async(req,res)=>{try{const {employeeId,date,checkIn,checkOut,status,notes}=req.body;const q=await pool.query(`INSERT INTO hrms_attendance(employee_id,attendance_date,check_in,check_out,status,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(employee_id,attendance_date) DO UPDATE SET check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,status=EXCLUDED.status,notes=EXCLUDED.notes RETURNING *`,[employeeId,date||new Date(),checkIn||null,checkOut||null,status||'Present',notes||null]);res.json({attendance:q.rows[0]});}catch(e){fail(res,e);}});

router.get('/leave',async(_req,res)=>{try{const q=await pool.query(`SELECT l.id,l.employee_id AS "employeeId",e.name AS employee,l.leave_type AS type,l.from_date AS "from",l.to_date AS "to",l.days,l.reason,l.status,l.created_at AS "createdAt" FROM hrms_leave_requests l JOIN hrms_employees e ON e.id=l.employee_id ORDER BY l.created_at DESC`);res.json({leaves:q.rows});}catch(e){fail(res,e);}});
router.post('/leave',async(req,res)=>{try{const {employeeId,type,from,to,reason}=req.body;if(!employeeId||!type||!from||!to)return res.status(400).json({error:'Employee, leave type and dates are required'});const days=Math.max(1,Math.floor((new Date(to)-new Date(from))/86400000)+1);const q=await pool.query(`INSERT INTO hrms_leave_requests(employee_id,leave_type,from_date,to_date,days,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[employeeId,type,from,to,days,reason||null]);const result=await pool.query(`SELECT l.id,l.employee_id AS "employeeId",e.name AS employee,l.leave_type AS type,l.from_date AS "from",l.to_date AS "to",l.days,l.reason,l.status FROM hrms_leave_requests l JOIN hrms_employees e ON e.id=l.employee_id WHERE l.id=$1`,[q.rows[0].id]);res.status(201).json({leave:result.rows[0]});}catch(e){fail(res,e);}});
router.patch('/leave/:id/status',async(req,res)=>{try{if(!['Approved','Rejected','Pending'].includes(req.body.status))return res.status(400).json({error:'Invalid leave status'});const q=await pool.query(`UPDATE hrms_leave_requests SET status=$1,reviewed_by=$2 WHERE id=$3 RETURNING *`,[req.body.status,req.user.email||req.user.id,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Leave request not found'});res.json({leave:q.rows[0]});}catch(e){fail(res,e);}});

router.get('/payroll',async(req,res)=>{try{const month=(req.query.month||new Date().toISOString().slice(0,7))+'-01';await pool.query(`INSERT INTO hrms_payroll(employee_id,payroll_month,gross_salary,deductions,net_salary) SELECT id,$1,monthly_salary,ROUND(monthly_salary*.08,2),ROUND(monthly_salary*.92,2) FROM hrms_employees WHERE status<>'Inactive' ON CONFLICT(employee_id,payroll_month) DO UPDATE SET gross_salary=EXCLUDED.gross_salary,deductions=EXCLUDED.deductions,net_salary=EXCLUDED.net_salary`,[month]);const q=await pool.query(`SELECT p.id,p.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.name,e.department,p.gross_salary::float AS gross,p.deductions::float,p.net_salary::float AS net,p.status FROM hrms_payroll p JOIN hrms_employees e ON e.id=p.employee_id WHERE p.payroll_month=$1 ORDER BY e.name`,[month]);res.json({payroll:q.rows,month});}catch(e){fail(res,e);}});
router.patch('/payroll/:id/status',async(req,res)=>{try{const status=req.body.status;if(!['Pending','Processed','Paid'].includes(status))return res.status(400).json({error:'Invalid payroll status'});const q=await pool.query(`UPDATE hrms_payroll SET status=$1,paid_at=CASE WHEN $1='Paid' THEN NOW() ELSE paid_at END WHERE id=$2 RETURNING *`,[status,req.params.id]);res.json({payroll:q.rows[0]});}catch(e){fail(res,e);}});

router.ready = ready;
module.exports = router;
