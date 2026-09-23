import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {usePermissions} from '../context/PermissionsContext';
import {API_BASE_URL} from '../api/config';
export default function LocalReminder(){
 const {isAdmin}=usePermissions();
 const [reminder,setReminder]=useState(null);
 useEffect(()=>{
  if(!isAdmin||import.meta.env.VITE_DEPLOYMENT_MODE!=='local')return;
  let active=true;
  async function check(){
   const now=new Date();
   const day=[now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');
   const user=localStorage.getItem('manod_user')||'';
   const key='indra-reminder:'+user+':'+day;
   if(now.getHours()<9||localStorage.getItem(key))return;
   try{
    const response=await fetch(API_BASE_URL+'/crm/followups',{headers:{Authorization:'Bearer '+localStorage.getItem('manod_token')}});
    if(!response.ok)return;
    const data=await response.json(),end=new Date(now);end.setHours(23,59,59,999);
    const count=(data.followups||[]).filter(f=>f.status==='Scheduled'&&f.start&&new Date(f.start)<=end).length;
    if(active&&count)setReminder({count,key});
   }catch{/* Retry on the next minute when the local server is available. */}
  }
  check();const timer=setInterval(check,60000);
  return()=>{active=false;clearInterval(timer);};
 },[isAdmin]);
 if(!reminder)return null;
 return <aside role="status" style={{position:'fixed',right:24,bottom:24,zIndex:2000,maxWidth:350,padding:20,background:'#fff8df',border:'1px solid #d9bc62',borderRadius:12,boxShadow:'0 8px 30px #0002'}}>
  <strong>Daily follow-up reminder</strong>
  <p>{reminder.count} follow-ups are due today or overdue.</p>
  <Link to="/crm/follow-ups">View follow-ups</Link>
  <button style={{marginLeft:16}} onClick={()=>{localStorage.setItem(reminder.key,'seen');setReminder(null);}}>Dismiss today</button>
 </aside>;
}
