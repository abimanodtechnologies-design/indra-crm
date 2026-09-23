import React, { useEffect, useState } from 'react';
import * as crmAPI from '../api/crmAPI';

const sections = [
  { key: 'vendors', title: 'Certified Vendors', fields: [['name','Vendor name *'],['contact_name','Contact person'],['email','Email'],['country','Country'],['categories','Products / categories'],['certification','Certification']] },
  { key: 'products', title: 'Product Catalogue', fields: [['name','Product name *'],['category','Category *'],['hs_code','HS code'],['specification','Specification'],['certification','Certification'],['unit_price','Unit price'],['currency','Currency']] },
  { key: 'rfqs', title: 'Buyer RFQs', fields: [['buyer_name','Buyer name *'],['buyer_email','Buyer email'],['quantity','Quantity'],['unit','Unit'],['incoterm','Incoterm'],['destination_country','Destination country'],['required_by','Required by']] },
  { key: 'quotations', title: 'Quotations & Proforma', fields: [['buyer_name','Buyer name *'],['buyer_email','Buyer email'],['amount','Amount'],['currency','Currency'],['incoterm','Incoterm'],['validity_date','Valid until']] },
  { key: 'orders', title: 'Export Orders', fields: [['buyer_name','Buyer name *'],['buyer_email','Buyer email'],['product_summary','Products'],['order_value','Order value'],['currency','Currency'],['incoterm','Incoterm'],['stage','Stage'],['production_status','Production status'],['expected_shipment','Expected shipment'],['container_no','Container no.'],['destination_country','Destination country']] },
  { key: 'shipments', title: 'Shipments & Containers', fields: [['buyer_name','Buyer name *'],['container_no','Container no.'],['vessel_name','Vessel name'],['port_of_loading','Port of loading'],['port_of_discharge','Port of discharge'],['etd','ETD'],['eta','ETA'],['status','Shipment status'],['milestone','Current milestone']] },
  { key: 'documents', title: 'Export Documents', fields: [['document_type','Document type *'],['buyer_name','Buyer name'],['document_date','Document date'],['status','Status'],['notes','Reference / notes']] },
  { key: 'payments', title: 'Export Payments', fields: [['buyer_name','Buyer name *'],['payment_type','Payment type'],['payment_mode','Payment mode (LC / TT)'],['currency','Currency'],['invoice_amount','Invoice amount'],['received_amount','Received amount'],['due_date','Due date'],['received_date','Received date'],['status','Payment status'],['lc_number','LC number']] },
  { key: 'purchase_enquiries', title: 'Purchase Enquiries', fields: [['vendor_name','Vendor *'],['product_name','Product *'],['quantity','Quantity'],['unit','Unit'],['required_by','Required by'],['quoted_price','Quoted price'],['currency','Currency'],['status','Status']] },
  { key: 'inventory', title: 'Inventory & Batches', fields: [['product_name','Product *'],['sku','SKU'],['warehouse','Warehouse'],['batch_no','Batch / lot'],['quantity','Quantity'],['reserved_quantity','Reserved quantity'],['reorder_level','Reorder level'],['unit','Unit'],['status','Status']] },
  { key: 'packing_dispatch', title: 'Packing & Dispatch', fields: [['buyer_name','Buyer'],['packing_status','Packing status'],['package_count','Package count'],['gross_weight','Gross weight'],['dispatch_date','Dispatch date'],['status','Dispatch status']] },
];

const input = { width:'100%', boxSizing:'border-box', border:'1px solid #dbe4dc', borderRadius:7, padding:'9px 10px', fontSize:13 };
const button = { border:0, borderRadius:7, background:'#1a5c38', color:'#fff', padding:'9px 13px', cursor:'pointer', fontWeight:700 };

export default function ExportWorkspace() {
  const [active, setActive] = useState('vendors');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const section = sections.find((item) => item.key === active);
  const load = async (entity = active) => {
    setLoading(true);
    try { const result = await crmAPI.fetchExportItems(entity); setItems(result.items || []); }
    catch (error) { alert(`Could not load ${entity}: ${error.message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { setForm({}); setEditing(null); setViewing(null); load(active); }, [active]);
  const save = async (event) => {
    event.preventDefault();
    try { if (editing) await crmAPI.updateExportItem(active, editing.id, form); else await crmAPI.createExportItem(active, form); setForm({}); setEditing(null); await load(); }
    catch (error) { alert(error.message); }
  };
  return <div style={{ padding:24, background:'#f9fafb', minHeight:'calc(100vh - 125px)' }}>
    <div style={{ marginBottom:20 }}><h1 style={{ margin:0, color:'#153b28', fontSize:25 }}>Raya International Exports</h1><p style={{ margin:'6px 0 0', color:'#64748b' }}>Export sales workspace — buyers, certified suppliers, products, RFQs and proforma quotations.</p></div>
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>{sections.map((item) => <button key={item.key} onClick={() => setActive(item.key)} style={{ ...button, background:active === item.key ? '#1a5c38' : '#eaf3ed', color:active === item.key ? '#fff' : '#1a5c38' }}>{item.title}</button>)}</div>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(280px, 360px) 1fr', gap:18, alignItems:'start' }}>
      <form onSubmit={save} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:18 }}><h2 style={{ fontSize:16, margin:'0 0 14px' }}>{editing ? 'Edit' : 'Add'} {section.title.replace(/s$/, '')}</h2>{section.fields.map(([key,label]) => <label key={key} style={{ display:'block', fontSize:12, fontWeight:700, color:'#475569', marginBottom:11 }}>{label}<input required={label.includes('*')} type={key.includes('date') || ['required_by','etd','eta'].includes(key) ? 'date' : ['unit_price','quantity','amount','order_value','invoice_amount','received_amount'].includes(key) ? 'number' : 'text'} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ ...input, marginTop:5 }} /></label>)}<button style={button}>{editing ? 'Update' : 'Save'}</button>{editing && <button type="button" onClick={()=>{setEditing(null);setForm({});}} style={{...button,background:'#64748b',marginLeft:8}}>Cancel</button>}</form>
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, overflow:'auto' }}><div style={{ padding:'15px 18px', borderBottom:'1px solid #e5e7eb', fontWeight:800 }}>{section.title} <span style={{ color:'#64748b', fontWeight:500 }}>({items.length})</span></div>{loading ? <p style={{ padding:18 }}>Loading…</p> : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}><thead><tr>{section.fields.slice(0,5).map(([,label]) => <th key={label} style={{ padding:12, textAlign:'left', color:'#64748b', borderBottom:'1px solid #e5e7eb' }}>{label.replace(' *','')}</th>)}<th style={{padding:12}}>Actions</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}>{section.fields.slice(0,5).map(([key]) => <td key={key} style={{ padding:12, borderBottom:'1px solid #f1f5f9' }}>{row[key] || '—'}</td>)}<td style={{padding:8}}><button onClick={()=>setViewing(row)} style={{...button,background:'#2563eb',marginRight:4}}>View</button><button onClick={()=>{setEditing(row);setForm(row);}} style={{...button,background:'#d97706',marginRight:4}}>Edit</button><button onClick={async()=>{if(window.confirm('Delete this record?')){await crmAPI.deleteExportItem(active,row.id);await load();}}} style={{...button,background:'#dc2626'}}>Delete</button></td></tr>)}{!items.length && <tr><td colSpan="6" style={{ padding:28, textAlign:'center', color:'#64748b' }}>No records yet. Add your first record using the form.</td></tr>}</tbody></table>}{viewing && <div style={{padding:16,borderTop:'1px solid #e5e7eb'}}><strong>Record details</strong><button onClick={()=>setViewing(null)} style={{float:'right',border:0,background:'none'}}>Close</button><pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(viewing,null,2)}</pre></div>}</div>
    </div>
  </div>;
}
