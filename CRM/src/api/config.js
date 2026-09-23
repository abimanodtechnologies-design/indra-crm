// Express serves production and Vite proxies /api in development.
const configured = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = (import.meta.env.VITE_DEPLOYMENT_MODE === 'local'
  ? '/api' : (configured || '/api')).replace(/\/+$/, '');
export const CRM_API_BASE_URL = `${API_BASE_URL}/crm`;
