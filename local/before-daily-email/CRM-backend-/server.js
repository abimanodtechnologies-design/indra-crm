require('./config/environment');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./config/database');
const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '127.0.0.1';
const allowed = new Set(['http://localhost:5173','http://127.0.0.1:5173',
  'http://localhost:'+PORT,'http://127.0.0.1:'+PORT,
  ...String(process.env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean)]);
app.use(cors({origin(origin,callback){callback(null,!origin||allowed.has(origin));}}));
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true}));
app.get('/api/health',async(req,res)=>{
  try { await pool.query('SELECT 1');res.json({status:'ok',database:'connected',deployment:process.env.DEPLOYMENT_MODE||'configured'}); }
  catch {res.status(503).json({status:'unavailable',database:'disconnected'});}
});
async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Run local setup.');
  await pool.query('SELECT 1');
  const crm = require('./routes/crm');
  await crm.ready;
  app.use('/api/auth',require('./routes/auth'));
  app.use('/api/users',require('./routes/users'));
  app.use('/api/roles',require('./routes/roles'));
  app.use('/api/crm',crm);
  const authenticate = require('./middleware/auth');
  const {requirePermission} = require('./middleware/permission');
  app.post('/api/local/backup',authenticate,requirePermission('Local Backup','Create backup'),async(req,res)=>{
    if(process.env.DEPLOYMENT_MODE!=='local')return res.status(404).json({error:'Local deployment only'});
    try{const message=await require('./services/localBackup').createBackup();res.json({success:true,message});}
    catch(err){res.status(500).json({error:err.message});}
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found'}));
  const dist=path.resolve(__dirname,'../CRM/dist');
  app.use(express.static(dist));
  app.get('*',(req,res)=>{
    if(!fs.existsSync(path.join(dist,'index.html')))return res.status(503).send('Build React first: run SETUP-LOCAL.cmd.');
    res.sendFile(path.join(dist,'index.html'));
  });
  app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({error:'Request failed'});});
  const server=app.listen(PORT,HOST,()=>{
    console.log('Indra CRM: http://localhost:'+PORT+' | local PostgreSQL | Ctrl+C to close');
    require('./services/localBackup').scheduleBackups();
  });
  server.on('error',err=>{console.error(err.message);pool.end().finally(()=>process.exit(1));});
  const shutdown=()=>{server.close(()=>pool.end().finally(()=>process.exit(0)));setTimeout(()=>process.exit(1),5000).unref();};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
if(require.main===module)start().catch(err=>{console.error('Startup failed:',err.message);pool.end().finally(()=>process.exit(1));});
module.exports={app,start};
