const normalize=v=>String(v||'').trim().toLowerCase();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&!/@[^@]+\.(local|invalid)$/i.test(v);
function belongsTo(item,person){
 if(item.assigned_user_id)return String(item.assigned_user_id)===String(person.id);
 const value=normalize(item.assigned);return !!value&&[person.id,person.name,person.email].map(normalize).filter(Boolean).includes(value);
}
function recipients(users,followups,adminSetting){
 const people=users.filter(u=>validEmail(u.email||'')).map(u=>({id:String(u.id),name:u.full_name||u.email,email:normalize(u.email)}));
 const configured=String(adminSetting||'').split(',').map(normalize).filter(validEmail);
 const adminEmails=[...new Set(configured.length?configured:users.filter(u=>['admin','administrator','super admin','superadmin'].includes(normalize(u.role))).map(u=>normalize(u.email)).filter(validEmail))];
 const salespeople=people.filter(p=>followups.some(f=>belongsTo(f,p)));
 return {salespeople,adminEmails};
}
module.exports={belongsTo,recipients};
