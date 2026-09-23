const API_PORT = import.meta.env.VITE_API_PORT || "5000";
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

const browserApiUrl = () => {
  if (typeof window === "undefined") return `http://localhost:${API_PORT}/api`;
  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api`;
};

const apiBaseUrl = configuredApiUrl || browserApiUrl();

export const API_BASE_URL = apiBaseUrl.replace(/\/+$/, "");
export const CRM_API_BASE_URL = `${API_BASE_URL}/crm`;