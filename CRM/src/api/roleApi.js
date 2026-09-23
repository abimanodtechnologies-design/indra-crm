import axios from "axios";
import { API_BASE_URL } from "./config";

const API_URL = API_BASE_URL;

const getToken = () => localStorage.getItem("manod_token");

export const fetchAllRoles = async () => {
  try {
    const token = getToken();
    const res = await axios.get(`${API_URL}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = res.data;
    const roles = payload?.roles || payload?.data || payload;
    return Array.isArray(roles) ? roles : [];
  } catch {
    console.warn("Roles module not available, returning empty list");
    return [];
  }
};


