// Windows local PostgreSQL lifecycle. No cloud connections are made by this script.
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const crypto = require('crypto');
const root = __dirname;
const local = path.join(root, 'local');
const backend = path.join(root, 'CRM-backend-');
const { Client } = require(path.join(backend, 'node_modules/pg'));
const dotenv = require(path.join(backend, 'node_modules/dotenv'));
const configPath = path.join(local, 'config.json');
const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
function config() {
  if (!fs.existsSync(configPath)) throw new Error('Run SETUP-LOCAL.cmd first.');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function exe(c, name) { return path.join(c.pgBin, name + '.exe'); }
function run(c, name, args, extra = {}) {
  const r = spawnSync(exe(c, name), args, { encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(c.dbPort), PGUSER: 'indra_owner',
      PGPASSWORD: c.ownerPassword, PGDATABASE: c.database, PGCONNECT_TIMEOUT: '10' }, ...extra });
  if (r.error || r.status !== 0) throw new Error(r.error?.message || r.stderr || r.stdout || name + ' failed');
  return r.stdout;
}
async function connect(c, database = c.database, owner = true) {
  const client = new Client({ host: '127.0.0.1', port: c.dbPort, database,
    user: owner ? 'indra_owner' : 'indra_app', password: owner ? c.ownerPassword : c.appPassword });
  await client.connect();
  return client;
}
function startDatabase(c) {
  const data = path.join(local, 'postgres');
  // Probe the actual server before pg_ctl: direct Windows starts may not have
  // postmaster.opts, so pg_ctl status alone can misidentify an active cluster.
  const probe = spawnSync(exe(c,'pg_isready'),['-h','127.0.0.1','-p',String(c.dbPort),'-t','2'],{windowsHide:true,encoding:'utf8'});
  if (probe.status === 0) {
    const actual=run(c,'psql',['-X','-A','-t','-d','postgres','-c','SHOW data_directory']).trim();
    if(path.resolve(actual).toLowerCase()!==path.resolve(data).toLowerCase())throw new Error('Database port is occupied by another PostgreSQL cluster.');
    return;
  }
  if(probe.status === 1)throw new Error('PostgreSQL is still starting. Retry shortly.');
  const status = spawnSync(exe(c, 'pg_ctl'), ['status', '-D', data], {windowsHide:true,encoding:'utf8'});
  if (status.status !== 0) {
    try { run(c, 'pg_ctl', ['start', '-D', data, '-l', path.join(local, 'postgres.log'), '-w']); }
    catch (err) {
      if (!/restricted token/.test(err.message)) throw err;
      // pg_ctl may fail to create a second restricted Windows token. postgres itself can run under the existing restricted account.
      const log=fs.openSync(path.join(local,'postgres.log'),'a');
      const child=spawn(exe(c,'postgres'),['-D',data],{detached:true,windowsHide:true,stdio:['ignore',log,log]});
      child.unref();fs.closeSync(log);
      let ready=false;
      for(let i=0;i<40;i++){
        const probe=spawnSync(exe(c,'pg_isready'),['-h','127.0.0.1','-p',String(c.dbPort),'-t','1'],{windowsHide:true});
        if(probe.status===0){ready=true;break;}
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
      }
      if(!ready)throw new Error('PostgreSQL startup failed. See local/postgres.log.');
    }
  }
}
function writeEnvironment(c) {
  fs.writeFileSync(path.join(backend, '.env.local'), [
    'DEPLOYMENT_MODE=local', 'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=5000',
    'DB_HOST=127.0.0.1', 'DB_PORT=' + c.dbPort, 'DB_NAME=' + c.database,
    'DB_USER=indra_app', 'DB_PASSWORD=' + c.appPassword, 'DB_SSL=false', 'JWT_SECRET=' + c.jwtSecret,
    'EMAIL_ENABLED=false', 'SMS_ENABLED=false', 'AUTOMATIONS_ENABLED=false',
    'PUBLIC_FRONTEND_URL=http://localhost:5000', 'FRONTEND_URL=http://localhost:5000',
    'BACKUP_ENABLED=true', 'BACKUP_HOUR=18', 'TZ=Asia/Kolkata', ''
  ].join('\n'));
}
async function setup() {
  fs.mkdirSync(local, {recursive:true});
  let c;
  if (fs.existsSync(configPath)) c = config();
  else {
    const pgHome = path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL');
    const versions = fs.existsSync(pgHome) ? fs.readdirSync(pgHome).sort((a,b)=>Number(b)-Number(a)) : [];
    const pgBin = process.env.PG_BIN || versions.map(v=>path.join(pgHome,v,'bin')).find(p=>fs.existsSync(path.join(p,'initdb.exe')));
    if (!pgBin) throw new Error('Install PostgreSQL 18 or set PG_BIN to its bin directory.');
    c = { pgBin, dbPort: 55432, database: 'indra_crm', ownerPassword: crypto.randomBytes(32).toString('hex'),
      appPassword: crypto.randomBytes(32).toString('hex'), jwtSecret: crypto.randomBytes(48).toString('hex') };
    fs.writeFileSync(configPath, JSON.stringify(c,null,2));
  }
  const data = path.join(local,'postgres');
  if (!fs.existsSync(path.join(data,'PG_VERSION'))) {
    const pw = path.join(local,'.init-password');
    fs.writeFileSync(pw,c.ownerPassword);
    try { run(c,'initdb',['-D',data,'-U','indra_owner','--pwfile='+pw,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']); }
    finally { fs.rmSync(pw,{force:true}); }
    fs.appendFileSync(path.join(data,'postgresql.conf'),"\nlisten_addresses = '127.0.0.1'\nport = "+c.dbPort+"\ntimezone = 'Asia/Kolkata'\n");
  }
  startDatabase(c);
  const owner = await connect(c,'postgres');
  try {
    if (!(await owner.query("SELECT 1 FROM pg_roles WHERE rolname='indra_app'")).rowCount) {
      await owner.query("CREATE ROLE indra_app LOGIN PASSWORD '" + c.appPassword + "' NOSUPERUSER NOCREATEDB NOCREATEROLE");
    }
    if (!(await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[c.database])).rowCount) {
      await owner.query('CREATE DATABASE '+quote(c.database)+' OWNER indra_app');
    }
  } finally { await owner.end(); }
  let db = await connect(c);
  try {
    if (!(await db.query("SELECT to_regclass('public.users') AS table_name")).rows[0].table_name) {
      const schema = path.join(backend,'scripts','local-schema.sql');
      run(c,'psql',['-X','-v','ON_ERROR_STOP=1','--single-transaction','-c','SET ROLE indra_app;','-f',schema]);
    }
    await db.query("INSERT INTO crm_settings (id,company_name) VALUES (1,'Indra Engineering Services') ON CONFLICT (id) DO NOTHING");
    const count = Number((await db.query('SELECT COUNT(*) FROM users')).rows[0].count);
    if (count === 0) {
      const password = crypto.randomBytes(12).toString('base64url') + '!9a';
      const bcrypt = require(path.join(backend,'node_modules/bcryptjs'));
      await db.query("INSERT INTO users(email,password_hash,full_name,role) VALUES($1,$2,$3,'admin')",
        ['admin@indra.local', await bcrypt.hash(password,12), 'Indra Administrator']);
      fs.writeFileSync(path.join(local,'FIRST-LOGIN.txt'),'Local CRM: http://localhost:5000\nEmail: admin@indra.local\nPassword: '+password+'\nChange the password in User Management after login.\n');
    }
    await db.query("INSERT INTO roles(role_name,deletable) SELECT 'Admin',false WHERE NOT EXISTS (SELECT 1 FROM roles WHERE lower(role_name)='admin')");
  } finally { await db.end(); }
  // Preserve any operator changes on subsequent setup runs.
  if (!fs.existsSync(path.join(backend,'.env.local'))) writeEnvironment(c);
  console.log('Local database ready. Login details: local/FIRST-LOGIN.txt. Run START-LOCAL.cmd.');
}
async function backup(destination) {
  const c = config(); startDatabase(c);
  const dir = destination ? path.resolve(destination) : path.resolve(root,c.backupDir || 'local/backups');
  fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir,'indra-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump');
  try { run(c,'pg_dump',['--format=custom','--no-owner','--no-privileges','--schema=public','--file='+file]); }
  catch (err) { fs.rmSync(file,{force:true}); throw err; }
  console.log('Backup saved: '+file); return file;
}
async function restore(file) {
  if (!file || !fs.existsSync(path.resolve(file))) throw new Error('Usage: RESTORE-LOCAL.cmd "path to backup.dump"');
  const c = config(); startDatabase(c);
  // Restore into a NEW database, retaining the current one for rollback.
  const db = await connect(c,'postgres');
  const next = 'indra_restore_' + Date.now();
  try {
    const active = await db.query('SELECT count(*) FROM pg_stat_activity WHERE datname=$1 AND backend_type=$2',[c.database,'client backend']);
    if (Number(active.rows[0].count)) throw new Error('Stop the CRM application before restoring.');
    await backup();
    await db.query('CREATE DATABASE '+quote(next)+' OWNER indra_app');
    run({...c,database:next},'pg_restore',['--exit-on-error','--single-transaction','--clean','--if-exists','--no-owner','--no-privileges','--role=indra_app','--dbname='+next,path.resolve(file)]);
    const check = await connect(c,next);
    try { await check.query('SELECT id FROM users LIMIT 1'); await check.query('SELECT id FROM crm_leads LIMIT 1'); }
    finally { await check.end(); }
    c.previousDatabase = c.database; c.database = next; c.jwtSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(configPath,JSON.stringify(c,null,2));
    // Change only database and secret, preserving LAN and backup settings.
    const envPath = path.join(backend,'.env.local');
    let env = fs.readFileSync(envPath,'utf8');
    env = env.replace(/^DB_NAME=.*$/m,'DB_NAME='+c.database).replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+c.jwtSecret);
    fs.writeFileSync(envPath,env);
    console.log('Restore verified. Previous database retained: '+c.previousDatabase+'. Run START-LOCAL.cmd.');
  } finally { await db.end(); }
}
async function main() {
  const command = process.argv[2] || 'start';
  if (command==='setup') return setup();
  if (command==='backup') return backup(process.argv[3]);
  if (command==='restore') return restore(process.argv[3]);
  const c = config();
  if (command==='stop-db') {
    const db = await connect(c,'postgres');
    try {
      if (Number((await db.query('SELECT count(*) FROM pg_stat_activity WHERE datname=$1',[c.database])).rows[0].count))
        throw new Error('Close the CRM server first with Ctrl+C.');
    } finally { await db.end(); }
    run(c,'pg_ctl',['stop','-D',path.join(local,'postgres'),'-m','fast','-w']); return;
  }
  if (command==='start-db') { startDatabase(c); return; }
  if (command!=='start') throw new Error('Unknown command: '+command);
  startDatabase(c);
  if (!fs.existsSync(path.join(root,'CRM','dist','index.html'))) throw new Error('Run SETUP-LOCAL.cmd to build React.');
  const env = dotenv.parse(fs.readFileSync(path.join(backend,'.env.local')));
  const child = spawn(process.execPath,['server.js'],{cwd:backend,stdio:'inherit',env:{...process.env,...env},windowsHide:true});
  process.on('SIGINT',()=>child.kill('SIGINT'));
  process.on('SIGTERM',()=>child.kill('SIGTERM'));
  child.on('exit',code=>{process.exitCode=code || 0;});
}
if (require.main===module) main().catch(err=>{console.error(err.message);process.exitCode=1;});
module.exports = { config, backup, run, connect, root };
