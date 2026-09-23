import React, {useState} from 'react';
import * as crmAPI from '../api/crmAPI';
const groups = [
 ['Order Confirmed', [['PO / Order Number','orderNumber'],['Order Date','orderDate','date']]],
 ['Order Processing', [['Product / Specification','product'],['Quantity','quantity','number'],['Unit Price','unitPrice','number'],['Verification Notes','verification']]],
 ['Purchase / Procurement', [['Items to Source','itemsToSource'],['Supplier','supplier'],['Expected Procurement Date','procurementDate','date']]],
 ['Stock Availability', [['Stock Status','stockStatus',['Available','Partial','Awaiting Stock']],['Stock Notes','stockNotes']]],
 ['Dispatch Planning', [['Planned Dispatch Date','dispatchPlanDate','date'],['Packing / Material Notes','packingNotes']]],
 ['Invoice Generated', [['Invoice Number','invoiceNumber'],['Invoice Value','invoiceValue','number'],['Invoice Date','invoiceDate','date']]],
 ['Dispatch', [['Courier / Transporter','transporter'],['LR / AWB Number','trackingNumber'],['Dispatch Date','dispatchDate','date']]],
 ['Delivery Confirmation', [['Delivered Date','deliveredDate','date'],['Customer Acknowledgement','acknowledgement']]],
 ['Payment Follow-up', [['Payment Status','paymentStatus',['Paid','Partially Paid','Outstanding','Overdue']],['Payment Due Date','paymentDueDate','date'],['Payment Notes','paymentNotes']]],
 ['After-Sales Follow-up', [['Product Performance / Application','performance']]],
 ['Complaint / Support', [['Product Issue','issue'],['Technical / Application Support','support'],['Replacement Details','replacement']]],
 ['Feedback', [['Customer Feedback','feedback'],['Satisfaction (1–5)','satisfaction',['1','2','3','4','5']]]],
 ['Repeat Order Reminder', [['Next Purchase Follow-up Date','repeatDate','date'],['Repeat Order Notes','repeatNotes']]],
 ['Cross-sell / Upsell', [['Recommended Cutters / Inserts / Holders','recommendations']]],
 ['Lost / Cancelled Order', [['Cancellation / Loss Reason','cancellationReason']]],
];
const control={width:'100%',boxSizing:'border-box',padding:9,marginTop:5,border:'1px solid #ccd5cf',borderRadius:5};
export function CustomerSuccessDetails({item,stages,onSave}) {
 const [details,setDetails]=useState(item.order_details||{}),[stage,setStage]=useState(item.current_stage),[saving,setSaving]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(null),[loadingPreview,setLoadingPreview]=useState(false);
 const save=async e=>{e.preventDefault();setSaving(true);setError('');try{await onSave({currentStage:stage,orderDetails:details});}catch(e){setError(e.message);}finally{setSaving(false);}};
 const showPreview=async()=>{setLoadingPreview(true);setError('');try{const res=await crmAPI.fetchCustomerSuccessMessage(item.id);setPreview(res.message);}catch(e){setError(e.message);}finally{setLoadingPreview(false);}};
 return <form onSubmit={save}>
  <p><strong>{item.customer_name || item.lead_name}</strong> · Assigned: {item.assigned || 'Unassigned'}</p>
  <label>Current Stage<select aria-label="Current Stage" value={stage} onChange={e=>setStage(e.target.value)} style={control}>{!stages.includes(stage)&&<option>{stage}</option>}{stages.map(s=><option key={s}>{s}</option>)}</select></label>
  {groups.map(([title,fields])=><fieldset key={title} style={{border:'1px solid #dce4df',borderRadius:8,padding:14,margin:'18px 0'}}><legend>{title}</legend><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>{fields.map(([label,key,type='text'])=><label key={key}>{label}{Array.isArray(type)?<select aria-label={label} value={details[key]||''} onChange={e=>setDetails({...details,[key]:e.target.value})} style={control}><option value="">Select</option>{type.map(v=><option key={v}>{v}</option>)}</select>:<input aria-label={label} type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} value={details[key]||''} onChange={e=>setDetails({...details,[key]:e.target.value})} style={control}/>}</label>)}</div>{title==='Payment Follow-up'&&<p>Record collection status here. Use Payments to update the actual payment balance.</p>}{title==='Repeat Order Reminder'&&<p>Saving a date creates an assigned follow-up task for the daily reminder report.</p>}</fieldset>)}
  <div style={{border:'1px solid #dce4df',borderRadius:8,padding:14,marginTop:18,background:'#f7fbf8'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><strong>Customer message</strong><button type="button" onClick={showPreview} disabled={loadingPreview} style={{...control,width:'auto',marginTop:0,background:'#fff',cursor:'pointer'}}>{loadingPreview?'Loading…':'Generate message preview'}</button></div>{preview&&<><div style={{fontSize:12,color:'#557064',marginTop:8}}>{preview.channel} · {preview.subject}</div><textarea readOnly value={preview.text} rows={4} style={{...control,background:'#fff'}}/><button type="button" onClick={()=>navigator.clipboard?.writeText(preview.text)} style={{...control,width:'auto',marginTop:4,background:'#fff',cursor:'pointer'}}>Copy message</button></>}</div>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
  <button type="submit" disabled={saving} style={{...control,background:'#225b38',color:'white',cursor:'pointer'}}>{saving?'Saving…':'Save Order Details'}</button>
 </form>;
}
