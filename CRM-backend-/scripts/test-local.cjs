// Run against a locally running server. Creates and removes uniquely named fixtures.
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {config,connect,run}=require('../../local-crm.cjs');
async function main(){
 const c=config(),db=await connect(c);
 const name='LOCAL-TEST-'+crypto.randomUUID(),email=name.toLowerCase()+'@example.invalid';
 const password=crypto.randomBytes(20).toString('hex');
 const bcrypt=require('bcryptjs');
 let token,leadId,backupFile,restoreDb;
 async function api(url,method='GET',body){
  const r=await fetch('http://127.0.0.1:5000/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();assert.equal(r.status,200,method+' '+url+': '+JSON.stringify(data));return data;
 }
 try{
  await db.query("INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,'admin')",[email,await bcrypt.hash(password,10),name]);
  await api('/health');
  assert.equal((await fetch('http://127.0.0.1:5000/api/crm/leads')).status,401);
  token=(await api('/auth/login','POST',{email,password})).token;assert.ok(token);
  assert.equal((await api('/auth/my-permissions')).isAdmin,true);
  for(const url of ['/crm/leads','/crm/followups','/crm/proposals','/crm/contacts','/crm/campaigns','/crm/payment-reminders','/crm/customer-success','/crm/settings','/users','/roles'])await api(url);
  const lead=await api('/crm/leads','POST',{name,company:'Local verification',email,stage:'Qualified',source:'Referral',value:12500,customFields:{verification:true}});
  leadId=lead.lead.id;
  assert.equal(lead.automation.welcomeEmailSent,false);
  assert.equal(lead.automation.salespersonEmailSent,false);
  assert.ok((await api('/crm/leads')).leads.some(l=>l.id===leadId));
  const row=(await db.query('SELECT * FROM crm_leads WHERE id=$1',[leadId])).rows[0];
  assert.equal(row.custom_fields.verification,true);
  await api('/crm/followups','POST',{lead:name,title:name,start:new Date().toISOString(),status:'Scheduled'});
  await api('/crm/proposals','POST',{lead:name,subject:name,value:12500,status:'Draft'});
  await api('/crm/campaigns','POST',{name,subject:name,status:'Draft'});
  const output=await api('/local/backup','POST');
  backupFile=output.message.replace('Backup saved: ','').trim();assert.ok(fs.existsSync(backupFile));
  restoreDb='indra_test_'+Date.now();
  await db.query('CREATE DATABASE "'+restoreDb+'" OWNER indra_app');
  run({...c,database:restoreDb},'pg_restore',['--exit-on-error','--single-transaction','--clean','--if-exists','--no-owner','--no-privileges','--role=indra_app','--dbname='+restoreDb,backupFile]);
  const restored=await connect(c,restoreDb);
  try{assert.equal((await restored.query('SELECT id FROM crm_leads WHERE id=$1',[leadId])).rowCount,1);}
  finally{await restored.end();}
  console.log('PASS: login, permissions, 11 module reads, local lead persistence, follow-up/proposal/campaign writes, disabled email, backup and isolated restore.');
 }finally{
  if(restoreDb)await db.query('DROP DATABASE IF EXISTS "'+restoreDb+'"');
  await db.query('DELETE FROM crm_followups WHERE lead_name=$1 OR title=$1',[name]);
  await db.query('DELETE FROM crm_proposals WHERE subject=$1',[name]);
  await db.query('DELETE FROM crm_campaigns WHERE name=$1',[name]);
  if(leadId){await db.query('DELETE FROM crm_lead_locations WHERE lead_id=$1',[leadId]);await db.query('DELETE FROM crm_leads WHERE id=$1',[leadId]);}
  await db.query('DELETE FROM users WHERE email=$1',[email]);
  await db.end();
  // The test dump contains only our local test snapshot, not a user backup.
  if(backupFile)fs.rmSync(backupFile,{force:true});
 }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
