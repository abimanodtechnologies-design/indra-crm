import React, {useState} from 'react';

export const ENQUIRY_STATUSES = ['New', 'Quotation Sent', 'Follow-up', 'Order Received', 'Order Lost', 'Pending'];
export const enquiryStatus = lead => lead.custom_fields?.enquiry?.status || ({Won:'Order Received',Lost:'Order Lost',Proposal:'Quotation Sent',Negotiation:'Follow-up'}[lead.stage] || 'New');
export const getEnquiryProductValue = (products = []) => (Array.isArray(products) ? products : []).reduce((total, item) => {
  const qty = Math.max(0, Number(item.requiredQty ?? item.required_qty ?? item.quantity ?? 0));
  const price = Math.max(0, Number(String(item.targetPrice ?? item.target_price ?? item.unitPrice ?? item.unit_price ?? 0).replace(/[^0-9.-]/g, '')) || 0);
  return total + qty * price;
}, 0);
const box = {border:'1px solid #dce4df',borderRadius:10,padding:18,marginBottom:24};
const grid = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14};
const input = {display:'block',width:'100%',boxSizing:'border-box',padding:9,border:'1px solid #ccd5cf',borderRadius:5,marginTop:5};

export function EnquiryFields({formData, setFormData}) {
  const data = formData.customFields?.enquiry || {};
  const update = (key,value) => setFormData(previous => {
    const next = {...previous,customFields:{...previous.customFields,enquiry:{...previous.customFields?.enquiry,[key]:value}}};
    if (key === 'products') {
      const calculated = getEnquiryProductValue(value);
      if (calculated > 0 || (Array.isArray(value) && value.some(item => String(item.targetPrice ?? '').trim() !== ''))) next.value = calculated;
    }
    return next;
  });
  const field = (label,key,type='text') => <label key={key}>{label}<input aria-label={label} type={type} min={type==='number'?0:undefined} value={data[key] || ''} onChange={e=>update(key,e.target.value)} style={input}/></label>;
  const attachment = async e => {
    const file=e.target.files?.[0]; if(!file)return;
    if(file.type!=='application/pdf'||file.size>2*1024*1024){alert('Choose a PDF up to 2 MB.');e.target.value='';return;}
    try { const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});update('attachment',{name:file.name,data:content}); }
    catch {alert('Unable to read the attachment. Please try again.');}
  };
  return <section style={box} aria-label="Enquiry workflow">
    <h3>Enquiry workflow</h3>
    <p>Enquiry ID: {formData.id || 'Generated when saved'}</p>
    <div style={grid}>
      {field('Enquiry Date','date','date')}
      <label>Enquiry Status<select aria-label="Enquiry Status" value={data.status || enquiryStatus({...formData,custom_fields:formData.customFields})} onChange={e=>update('status',e.target.value)} style={input}>{ENQUIRY_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
      {field('Contact Person Name','contactName')}{field('Designation','designation')}
    </div>
    <h4>Product discussion</h4>
    {(data.products || [{brand:'Tungaloy',product:'',productCode:'',specification:'',requiredQty:1,targetPrice:''}]).map((item,index)=><div key={index} style={{...grid,marginBottom:8}}>{[['Brand / Make','brand'],['Product / Item','product'],['Product Code','productCode'],['Specification','specification'],['Required Qty','requiredQty'],['Target Price','targetPrice']].map(([label,key])=><label key={key}>{label}<input aria-label={label+' '+(index+1)} type={['requiredQty','targetPrice'].includes(key)?'number':'text'} min={['requiredQty','targetPrice'].includes(key)?0:undefined} value={item[key]??''} onChange={e=>{const defaults={brand:'Tungaloy',product:'',productCode:'',specification:'',requiredQty:1,targetPrice:''};const products=[...(data.products?.length ? data.products : [defaults])];products[index]={...defaults,...products[index],[key]:e.target.value};update('products',products)}} style={input}/></label>)}</div>)}
    <button type="button" onClick={()=>update('products',[...(data.products?.length ? data.products : [{brand:'Tungaloy',product:'',productCode:'',specification:'',requiredQty:1,targetPrice:''}]),{brand:'',product:'',productCode:'',specification:'',requiredQty:1,targetPrice:''}])}>Add product</button>
    <p>Example products: Tungaloy Tools, Bilz Tools, Planet Tools.</p>
    <h4>Quotation reference</h4>
    <div style={grid}>{field('Quotation No.','quotationNo')}{field('Quotation Created Date','quotationCreated','date')}{field('Quotation Sent Date','quotationSent','date')}</div>
    <p>Use Proposals to create/send quotations. Record the reference and PDF here; quotation amount is in Product Discussion.</p>
    <label>Quotation Attachment (PDF, up to 2 MB)<input aria-label="Quotation Attachment" type="file" accept="application/pdf" onChange={attachment} style={input}/></label>
    {data.attachment && <p><a href={data.attachment.data} download={data.attachment.name}>Download {data.attachment.name}</a> <button type="button" onClick={()=>update('attachment',null)}>Remove attachment</button></p>}
    <h4>Follow-up discussion</h4>
    <div style={grid}>{field('Discussion Date','discussionDate','date')}{field('Discussion / Feedback','feedback')}{field('Outcome','outcome')}{field('Next Action','nextAction')}{field('Next Follow-up Date','nextFollowup','date')}</div>
    <p>Each saved enquiry retains the latest discussion outcome and next action. Use the Follow-ups page for the complete activity history.</p>
    <h4>Order details</h4>
    <div style={grid}>{field('Order No.','orderNo')}{field('Order Date','orderDate','date')}{field('PO Number','poNumber')}{field('Order Value (INR)','orderValue','number')}{field('Expected Delivery','expectedDelivery','date')}</div>
    <h4>Lost order details</h4>
    <div style={grid}><label>Lost Reason<select aria-label="Lost Reason" value={data.lostReason||''} onChange={e=>update('lostReason',e.target.value)} style={input}><option value="">Select reason</option>{['Competitor','Price Issue','No Requirement','Other'].map(s=><option key={s}>{s}</option>)}</select></label>{field('Competitor','competitor')}{field('Lost Reason Details','lostDetails')}</div>
  </section>;
}

export function EnquiryReport({leads,proposals,followups=[],userOptions=[]}) {
  const pending=followups.filter(f=>['Scheduled','Pending'].includes(f.status));
  return <section style={box}><h2>Enquiry overview</h2><p>{leads.length} enquiries · {proposals.length} quotations · {pending.length} pending follow-ups</p>
    <div style={grid}>{ENQUIRY_STATUSES.map(s=><div key={s}><strong>{s}</strong>: {leads.filter(l=>enquiryStatus(l)===s).length}</div>)}</div>
    <h3>Salesperson performance</h3><table style={{width:'100%',textAlign:'left'}}><thead><tr>{['Salesperson','Enquiries','Orders Won','Orders Lost','Order Value'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{userOptions.map(u=>{const owned=leads.filter(l=>[u.value,u.email,String(u.userId)].filter(Boolean).some(v=>v.toLowerCase()===String(l.assigned||'').toLowerCase()));const won=owned.filter(l=>enquiryStatus(l)==='Order Received');return <tr key={u.value}><td>{u.label}</td><td>{owned.length}</td><td>{won.length}</td><td>{owned.filter(l=>enquiryStatus(l)==='Order Lost').length}</td><td>{won.reduce((sum,l)=>sum+Number(l.custom_fields?.enquiry?.orderValue||0),0).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td></tr>;})}</tbody></table>
  </section>;
}
