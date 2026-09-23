import {useState} from 'react';
import {API_BASE_URL} from '../api/config';
export default function LocalBackupPanel(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(import.meta.env.VITE_DEPLOYMENT_MODE!=='local')return null;
 async function backup(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch(API_BASE_URL+'/local/backup',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('manod_token')}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Backup failed');
   setMessage(data.message);
  }catch(error){setMessage(error.message);}finally{setBusy(false);}
 }
 return <section style={{maxWidth:600,padding:24,marginBottom:20,background:'#fff',border:'1px solid #dfe8e2',borderRadius:12}}>
  <h2 style={{marginTop:0,fontSize:18}}>Local database & backup</h2>
  <p style={{fontSize:14,lineHeight:1.6}}>Your records are stored in PostgreSQL on this computer. A daily backup runs after 6:00 PM while the CRM server is running.</p>
  <button disabled={busy} onClick={backup} style={{background:'#1a5c38',color:'white',border:0,borderRadius:7,padding:'10px 16px',cursor:'pointer'}}>{busy?'Creating backup…':'Back up now'}</button>
  <p role="status" style={{fontSize:13,overflowWrap:'anywhere'}}>{message}</p>
  <p style={{fontSize:12,color:'#596a61'}}>Backups: local/backups. To restore, close the server and run RESTORE-LOCAL.cmd with a backup file. Restore creates a separate database and preserves the previous one.</p>
 </section>;
}
