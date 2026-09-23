const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname,'../..');
let running = false;
function createBackup() {
  if (running) return Promise.reject(new Error('A backup is already running.'));
  running = true;
  return new Promise((resolve,reject)=>{
    const child = spawn(process.execPath,[path.join(root,'local-crm.cjs'),'backup'],{cwd:root,windowsHide:true});
    let output='', error='';
    child.stdout.on('data',d=>output+=d);
    child.stderr.on('data',d=>error+=d);
    child.on('error',err=>{running=false;reject(err);});
    child.on('close',code=>{running=false;code===0?resolve(output.trim()):reject(new Error(error||output||'Backup failed'));});
  });
}
function scheduleBackups() {
  if (process.env.DEPLOYMENT_MODE!=='local' || process.env.BACKUP_ENABLED!=='true') return;
  const marker=path.join(root,'local','last-backup-date.txt');
  let last=fs.existsSync(marker)?fs.readFileSync(marker,'utf8'):'';
  const tick=async()=>{
    const now=new Date();
    const date=now.toLocaleDateString('en-CA');
    if (now.getHours()<Number(process.env.BACKUP_HOUR||18)||last===date||running) return;
    try { await createBackup();fs.writeFileSync(marker,date);last=date;console.log('Scheduled local backup completed.'); }
    catch(err){console.error('Scheduled backup failed:',err.message);}
  };
  tick();
  const timer=setInterval(tick,60000);timer.unref();
}
module.exports={createBackup,scheduleBackups};
