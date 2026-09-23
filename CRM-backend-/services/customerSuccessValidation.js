module.exports=(data,stage)=>{
 if(!data||typeof data!=='object'||Array.isArray(data))return 'Invalid order details';
 for(const k of ['quantity','unitPrice','invoiceValue'])if(data[k]!==undefined&&data[k]!==''&&(!['number','string'].includes(typeof data[k])||!String(data[k]).trim()||!Number.isFinite(Number(data[k]))||Number(data[k])<0))return k+' must be a non-negative number';
 for(const k of ['orderDate','procurementDate','dispatchPlanDate','invoiceDate','dispatchDate','deliveredDate','paymentDueDate','repeatDate'])if(data[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(data[k])||!Number.isFinite(Date.parse(data[k]))||new Date(data[k]).toISOString().slice(0,10)!==data[k]))return 'Invalid '+k;
 if(data.stockStatus&&!['Available','Partial','Awaiting Stock'].includes(data.stockStatus))return 'Invalid stock status';
 if(data.paymentStatus&&!['Paid','Partially Paid','Outstanding','Overdue'].includes(data.paymentStatus))return 'Invalid payment status';
 if(stage==='Lost / Cancelled Order'&&!String(data.cancellationReason||'').trim())return 'Cancellation/loss reason is required';
 if(data.satisfaction&&!['1','2','3','4','5'].includes(String(data.satisfaction)))return 'Satisfaction must be 1 to 5';
 return null;
};
