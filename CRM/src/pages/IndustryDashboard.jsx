import React, { useEffect, useState } from 'react';
import * as crmAPI from '../api/crmAPI';

const groups = {
  export: [
    ['vendors','Certified Vendors'], ['products','Products'], ['rfqs','Open RFQs'], ['quotations','Quotations'], ['orders','Export Orders'], ['shipments','Shipments'], ['payments','Payment Records'],
  ],
  real_estate: [
    ['properties','Available Properties'], ['site_visits','Site Visits'], ['bookings','Bookings'], ['real_estate_payments','Collections'], ['brokers','Channel Partners'],
  ],
};
export default function IndustryDashboard({ industry, onOpen }) {
  const [data, setData] = useState({}); const [loading, setLoading] = useState(true);
  const entries = groups[industry] || [];
  useEffect(() => { let alive=true; setLoading(true); Promise.all(entries.map(([key]) => crmAPI.fetchExportItems(key).then(r => [key, r.items || []]).catch(() => [key, []]))).then(rows => { if (alive) setData(Object.fromEntries(rows)); setLoading(false); }); return () => { alive=false; }; }, [industry]);
  const title = industry === 'export' ? 'Export Operations Dashboard' : 'Real Estate Dashboard';
  const subtitle = industry === 'export' ? 'RFQs, orders, shipments and collections at a glance' : 'Property availability, visits, bookings and collections at a glance';
  return <div style={{padding:24}}><h1 style={{margin:0,fontSize:24,color:'#153b28'}}>{title}</h1><p style={{color:'#64748b',marginTop:6}}>{subtitle}</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14,marginTop:20}}>{entries.map(([key,label]) => <button key={key} onClick={() => onOpen(industry === 'export' ? 'export' : 'real-estate')} style={{textAlign:'left',padding:18,border:'1px solid #dbe4dc',borderRadius:10,background:'#fff',cursor:'pointer'}}><div style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase'}}>{label}</div><div style={{fontSize:30,fontWeight:800,color:'#1a5c38',marginTop:6}}>{loading ? '—' : data[key]?.length || 0}</div></button>)}</div><div style={{marginTop:22,padding:18,border:'1px solid #dbe4dc',borderRadius:10,background:'#f4faf5'}}><strong>{industry === 'export' ? 'Export workflow' : 'Sales workflow'}</strong><div style={{marginTop:8,color:'#475569'}}>{industry === 'export' ? 'RFQ → Quotation → Export Order → Shipment → Payment Collection' : 'Lead → Site Visit → Booking → Agreement → Registration → Possession'}</div></div></div>;
}
