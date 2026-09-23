// Explicit, one-time migration: reads cloud public schema/data; writes only locally.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const {config,root}=require('../../local-crm.cjs');
const dotenv=require('dotenv');
const c=config();
const cloud=dotenv.parse(fs.readFileSync(path.join(root,'CRM-backend-','.env')));
if(!cloud.DB_HOST||['localhost','127.0.0.1','::1'].includes(cloud.DB_HOST))throw new Error('Legacy .env does not identify a cloud database.');
const output=path.join(root,'local','cloud-migration-'+Date.now()+'.dump');
const result=spawnSync(path.join(c.pgBin,'pg_dump.exe'),['--format=custom','--schema=public','--no-owner','--no-privileges','--file='+output],{
 windowsHide:true,encoding:'utf8',env:{...process.env,PGHOST:cloud.DB_HOST,PGPORT:cloud.DB_PORT,
 PGDATABASE:cloud.DB_NAME,PGUSER:cloud.DB_USER,PGPASSWORD:cloud.DB_PASSWORD,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'}});
if(result.status!==0){fs.rmSync(output,{force:true});console.error(result.stderr||result.error?.message);process.exitCode=1;}
else{
 console.log('Cloud snapshot downloaded. No cloud records were changed.');
 console.log('Close the CRM server, then run:');
 console.log('RESTORE-LOCAL.cmd "'+output+'"');
 console.log('After restoration, sign in with your existing cloud account. Keep this dump private.');
}
