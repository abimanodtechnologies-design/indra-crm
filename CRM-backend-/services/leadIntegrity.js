// Idempotent, transactional migration. Existing ambiguous links are preserved.
module.exports = async function ensureLeadIntegrity(pool) {
 const client=await pool.connect();
 const links=[['crm_followups','lead_name'],['crm_proposals','lead_name'],['crm_contacts','linked_lead'],['crm_payment_reminders','lead_name'],['crm_customer_success','lead_name']];
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(741963)');
  const tables=['crm_leads',...links.map(x=>x[0])];
  const states=(await client.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])',[tables])).rows;
  for(const t of tables) await client.query('ALTER TABLE '+t+' DISABLE ROW LEVEL SECURITY');
  for(const [t,key] of links){
   await client.query('ALTER TABLE '+t+' ADD COLUMN IF NOT EXISTS lead_id TEXT');
   await client.query('UPDATE '+t+' r SET lead_id=l.id::text FROM crm_leads l WHERE r.lead_id IS NULL AND r.'+key+'=l.name AND r.crm_industry=l.crm_industry AND (SELECT count(*) FROM crm_leads other WHERE other.name=l.name AND other.crm_industry=l.crm_industry)=1');
   await client.query('CREATE INDEX IF NOT EXISTS '+t+'_lead_id_idx ON '+t+'(lead_id)');
  }
  await client.query('ALTER TABLE crm_customer_success DROP CONSTRAINT IF EXISTS crm_customer_success_lead_name_key');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS crm_payment_proposal_unique ON crm_payment_reminders(proposal_id) WHERE proposal_id IS NOT NULL');
  await client.query(`
   CREATE OR REPLACE FUNCTION crm_bind_lead_id() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE data jsonb; previous jsonb; label text; canonical text; target text; workspace text; matches integer;
   BEGIN
    data:=to_jsonb(NEW); label:=NULLIF(data->>TG_ARGV[0],''); target:=NULLIF(data->>'lead_id','');
    workspace:=COALESCE(NULLIF(data->>'crm_industry',''),(SELECT crm_industry FROM crm_settings WHERE id=1));
    IF TG_OP='UPDATE' THEN
     previous:=to_jsonb(OLD);
     IF (data->>TG_ARGV[0]) IS NOT DISTINCT FROM (previous->>TG_ARGV[0])
        AND target IS NOT DISTINCT FROM NULLIF(previous->>'lead_id','') THEN RETURN NEW; END IF;
    END IF;
    IF target IS NOT NULL THEN
     SELECT name INTO canonical FROM crm_leads WHERE id::text=target AND crm_industry=workspace;
     IF NOT FOUND THEN RAISE EXCEPTION 'Linked lead is unavailable in this workspace' USING ERRCODE='23514'; END IF;
     IF TG_OP='UPDATE' AND target=previous->>'lead_id' AND label IS DISTINCT FROM canonical THEN target:=NULL; END IF;
    END IF;
    IF target IS NULL AND label IS NOT NULL THEN
     SELECT count(*),min(id::text) INTO matches,target FROM crm_leads WHERE name=label AND crm_industry=workspace;
     IF matches<>1 THEN RAISE EXCEPTION 'Select a unique existing lead for this record' USING ERRCODE='23514'; END IF;
     canonical:=label;
    END IF;
    data:=jsonb_set(data,'{lead_id}',COALESCE(to_jsonb(target),'null'::jsonb));
    IF target IS NOT NULL THEN data:=jsonb_set(data,ARRAY[TG_ARGV[0]],to_jsonb(canonical)); END IF;
    NEW:=jsonb_populate_record(NEW,data);
    RETURN NEW;
   END; $$;
  `);
  for(const [t,key] of links){
   await client.query('DROP TRIGGER IF EXISTS '+t+'_link_lead ON '+t);
   await client.query('CREATE TRIGGER '+t+'_link_lead BEFORE INSERT OR UPDATE ON '+t+" FOR EACH ROW EXECUTE FUNCTION crm_bind_lead_id('"+key+"')");
  }
  await client.query(`
   CREATE OR REPLACE FUNCTION crm_sync_lead_label() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
     UPDATE crm_followups SET lead_name=NEW.name WHERE lead_id=NEW.id::text;
     UPDATE crm_proposals SET lead_name=NEW.name WHERE lead_id=NEW.id::text;
     UPDATE crm_contacts SET linked_lead=NEW.name WHERE lead_id=NEW.id::text;
     UPDATE crm_payment_reminders SET lead_name=NEW.name WHERE lead_id=NEW.id::text;
     UPDATE crm_customer_success SET lead_name=NEW.name WHERE lead_id=NEW.id::text;
    END IF;
    RETURN NEW;
   END; $$;
   DROP TRIGGER IF EXISTS crm_sync_lead_label ON crm_leads;
   CREATE TRIGGER crm_sync_lead_label AFTER UPDATE OF name ON crm_leads FOR EACH ROW EXECUTE FUNCTION crm_sync_lead_label();
  `);
  for(const state of states){
   await client.query('ALTER TABLE '+state.relname+(state.relrowsecurity?' ENABLE':' DISABLE')+' ROW LEVEL SECURITY');
   await client.query('ALTER TABLE '+state.relname+(state.relforcerowsecurity?' FORCE':' NO FORCE')+' ROW LEVEL SECURITY');
  }
  await client.query('COMMIT');
 }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
};
