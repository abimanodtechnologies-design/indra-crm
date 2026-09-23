module.exports = function validateEnquiry(data) {
 if(data===undefined)return null;
 if(!data||typeof data!=='object'||Array.isArray(data))return 'Invalid enquiry details';
 const statuses=['New','Quotation Sent','Follow-up','Order Received','Order Lost','Pending'];
 if(data.status&&!statuses.includes(data.status))return 'Invalid enquiry status';
 if(data.orderValue!==undefined&&data.orderValue!==''&&(typeof data.orderValue!=='string'&&typeof data.orderValue!=='number'||!Number.isFinite(Number(data.orderValue))||Number(data.orderValue)<0))return 'Order value must be a non-negative number';
 if(data.status==='Order Received'&&(!String(data.orderNo||'').trim()||!data.orderDate))return 'Order number and date are required for Order Received';
 if(data.status==='Order Lost'&&!['Competitor','Price Issue','No Requirement','Other'].includes(data.lostReason))return 'Select a lost reason';
 for(const key of ['date','quotationCreated','quotationSent','discussionDate','orderDate','expectedDelivery'])if(data[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(data[key])||!Number.isFinite(Date.parse(data[key]))||new Date(data[key]).toISOString().slice(0,10)!==data[key]))return 'Invalid '+key;
 if(data.attachment){const a=data.attachment;if(typeof a.name!=='string'||typeof a.data!=='string'||!/^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=\r\n]*$/.test(a.data)||a.data.length>2800000)return 'Quotation attachment must be a PDF up to 2 MB';}
 return null;
};
