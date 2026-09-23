// ====================================================
// USER API - connects to backend
// Handles token expiry + all CRUD + reset password
// ====================================================

import { API_BASE_URL } from "./config";

const BASE_URL = API_BASE_URL;
// âœ… CORRECT
const getToken = () => localStorage.getItem("manod_token");

// If token expired â†’ clear storage â†’ redirect to login
const handleUnauthorized = () => {
  localStorage.removeItem("manod_token");
  localStorage.removeItem("manod_user");
  window.location.href = "/login";
};

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const handleResponse = async (res) => {
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please login again.");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

// GET all users
export const fetchAllUsers = async () => {
  const res = await fetch(`${BASE_URL}/users`, { headers: headers() });
  const data = await handleResponse(res);
  return data.users;
};

// GET user by ID
export const fetchUserById = async (id) => {
  const res = await fetch(`${BASE_URL}/users/${id}`, { headers: headers() });
  const data = await handleResponse(res);
  return data.user;
};

// POST create user
export const createUser = async (userData) => {
  const res = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(userData),
  });
  const data = await handleResponse(res);
  return data.user;
};

// PUT update user
export const updateUser = async (id, userData) => {
  const res = await fetch(`${BASE_URL}/users/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(userData),
  });
  const data = await handleResponse(res);
  return data.user;
};

// DELETE user
export const deleteUser = async (id) => {
  const res = await fetch(`${BASE_URL}/users/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  return handleResponse(res);
};

// PUT admin reset a user's password
export const resetUserPassword = async (id, newPassword) => {
  const res = await fetch(`${BASE_URL}/users/${id}/reset-password`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ newPassword }),
  });
  return handleResponse(res);
};


