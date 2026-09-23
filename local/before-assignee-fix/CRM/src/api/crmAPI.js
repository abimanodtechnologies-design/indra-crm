/**
 * src/api/crmAPI.js
 * Backend returns: { success: true, data: <row or rows> }
 * We reshape to named keys so CRM.jsx can use res.lead, res.leads, etc.
 */

import { CRM_API_BASE_URL } from './config';

const BASE = CRM_API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('manod_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
// Reshape list response  â†’ { [key]: [] }
// Reshape list response  â†’ { [key]: [] }
const list = (key) => async (method, path, body) => {
  const res = await request(method, path, body);
  const arr = res[key] || res.data || [];
  return { [key]: Array.isArray(arr) ? arr : [] };
};

// Reshape single response â†’ { [key]: {} }
const one = (key) => async (method, path, body) => {
  const res = await request(method, path, body);
  const item = res[key] || res.data;
  return { [key]: Array.isArray(item) ? item[0] : item };
};

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchCRMStats = () => request('GET', '/dashboard/stats');

// â”€â”€ Leads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchLeads    = (p = {}) => list('leads')('GET', `/leads?${new URLSearchParams(p)}`);
export const fetchLeadById = (id)     => one('lead')('GET', `/leads/${id}`);
export const createLead    = async (body) => {
  const res = await request('POST', '/leads', body);
  const item = res.lead || res.data;
  return { lead: Array.isArray(item) ? item[0] : item, automation: res.automation };
};
export const updateLead    = (id, b)  => one('lead')('PUT', `/leads/${id}`, b);
export const deleteLead    = (id)     => request('DELETE', `/leads/${id}`);
export const convertLead   = (id)     => one('lead')('PATCH', `/leads/${id}/convert`);
export const callLeadAi    = (id, b = {}) => request('POST', `/leads/${id}/ai-call`, b);

// â”€â”€ Follow-ups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchFollowups  = (p = {}) => list('followups')('GET', `/followups?${new URLSearchParams(p)}`);
export const createFollowup  = (body)   => one('followup')('POST', '/followups', body);
export const updateFollowup  = (id, b)  => one('followup')('PUT', `/followups/${id}`, b);
export const deleteFollowup  = (id)     => request('DELETE', `/followups/${id}`);

// â”€â”€ Campaigns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchCampaigns = (p = {}) => list('campaigns')('GET', `/campaigns?${new URLSearchParams(p)}`);
export const createCampaign = (body)   => one('campaign')('POST', '/campaigns', body);
export const sendCampaign   = (id, b)  => one('campaign')('POST', `/campaigns/${id}/send`, b);
export const deleteCampaign = (id)     => request('DELETE', `/campaigns/${id}`);
// â”€â”€ Proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchProposals  = (p = {}) => list('proposals')('GET', `/proposals?${new URLSearchParams(p)}`);
export const createProposal  = (body)   => one('proposal')('POST', '/proposals', body);
export const updateProposal  = (id, b)  => one('proposal')('PUT', `/proposals/${id}`, b);
export const sendProposal    = (id)     => one('proposal')('POST', `/proposals/${id}/send`);
export const deleteProposal  = (id)     => request('DELETE', `/proposals/${id}`);

// â”€â”€ Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchTemplates = (p = {}) => list('templates')('GET', `/templates?${new URLSearchParams(p)}`);
export const createTemplate = (body)   => one('template')('POST', '/templates', body);
export const updateTemplate = (id, b)  => one('template')('PUT', `/templates/${id}`, b);
export const deleteTemplate = (id)     => request('DELETE', `/templates/${id}`);

// â”€â”€ Contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fetchContacts = (p = {}) => list('contacts')('GET', `/contacts?${new URLSearchParams(p)}`);
export const createContact = (body)   => one('contact')('POST', '/contacts', body);
export const updateContact = (id, b)  => one('contact')('PUT', `/contacts/${id}`, b);
export const deleteContact = (id)     => request('DELETE', `/contacts/${id}`);



// Customer Success
export const fetchCustomerSuccess = (p = {}) => list('customerSuccess')('GET', `/customer-success?${new URLSearchParams(p)}`);
export const updateCustomerSuccess = (id, b) => one('customerSuccess')('PUT', `/customer-success/${id}`, b);
export const createCustomerSuccessFromLead = (leadId) => one('customerSuccess')('POST', `/customer-success/from-lead/${leadId}`);


// Payment Reminders
export const fetchPaymentReminders = (p = {}) => list('paymentReminders')('GET', `/payment-reminders?${new URLSearchParams(p)}`);
export const updatePaymentReminder = (id, b) => one('paymentReminder')('PUT', `/payment-reminders/${id}`, b);

// Installed Machines & Service
export const fetchMachines = () => list('machines')('GET', '/machines');
export const createMachine = (body) => one('machine')('POST', '/machines', body);
export const updateMachine = (id, body) => one('machine')('PUT', `/machines/${id}`, body);
export const deleteMachine = (id) => request('DELETE', `/machines/${id}`);
export const fetchMachineServices = (id) => list('services')('GET', `/machines/${id}/services`);
export const createMachineService = (id, body) => one('service')('POST', `/machines/${id}/services`, body);
export const deleteMachineService = (id) => request('DELETE', `/machine-services/${id}`);
export const fetchMachineServiceAttachments = (id) => list('attachments')('GET', `/machine-services/${id}/attachments`);
export const createMachineServiceAttachment = (id, body) => one('attachment')('POST', `/machine-services/${id}/attachments`, body);
export const downloadMachineServiceAttachment = async (id, fileName) => {
  const res = await fetch(`${BASE}/machine-service-attachments/${id}/download`, { headers: authHeaders() });
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `HTTP ${res.status}`); }
  const url = URL.createObjectURL(await res.blob());
  const anchor = Object.assign(document.createElement('a'), { href: url, download: fileName || 'service-attachment' });
  anchor.click();
  URL.revokeObjectURL(url);
};

// Export sales workspace
export const fetchExportItems = (entity) => list('items')('GET', `/export/${entity}`);
export const createExportItem = (entity, body) => one('item')('POST', `/export/${entity}`, body);
export const updateExportItem = (entity, id, body) => one('item')('PUT', `/export/${entity}/${id}`, body);
export const deleteExportItem = (entity, id) => request('DELETE', `/export/${entity}/${id}`);
export const fetchMachineConsumables = () => list('consumables')('GET', '/machine-consumables');
export const createMachineConsumable = (body) => one('consumable')('POST', '/machine-consumables', body);
export const updateMachineConsumable = (id, body) => one('consumable')('PUT', `/machine-consumables/${id}`, body);
export const deleteMachineConsumable = (id) => request('DELETE', `/machine-consumables/${id}`);
export const fetchMachineReplacements = () => list('replacements')('GET', '/machine-replacements');
export const createMachineReplacement = (body) => one('replacement')('POST', '/machine-replacements', body);
export const updateMachineReplacement = (id, body) => one('replacement')('PUT', `/machine-replacements/${id}`, body);
export const deleteMachineReplacement = (id) => request('DELETE', `/machine-replacements/${id}`);

// CRM Settings
export const fetchSettings = () => one('settings')('GET', '/settings');
export const updateSettings = (body) => one('settings')('PUT', '/settings', body);


