import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  fetchAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
} from "../api/userApi";
import { fetchAllRoles } from "../api/roleApi";
import { usePermissions } from "../context/PermissionsContext";  // ← NEW: permission checking

const emptyForm = {
  prefix: "", firstName: "", lastName: "", email: "", isActive: true,
  servicePinEnabled: false, allowLogin: true, username: "", password: "",
  confirmPassword: "", role: "admin",
  accessLocations: "All Locations",
  salesCommission: "", maxDiscount: "", allowContacts: "",
  dob: "", gender: "", maritalStatus: "", bloodGroup: "",
  mobile: "", altContact: "", familyContact: "",
  facebook: "", twitter: "",
  guardianName: "", idProofName: "", idProofNumber: "",
  permanentAddress: "", currentAddress: "",
  accountHolder: "", accountNumber: "", bankName: "", bankCode: "", branch: "", taxPayerId: "",
  department: "", designation: "", salaryPeriod: "Per Month",
  primaryWorkLocation: "", basicSalary: "",
};

const TABS = ["basic", "sales", "personal", "bank", "hrm"];
const TAB_LABELS = { basic: "Basic Info", sales: "Sales", personal: "Personal", bank: "Bank Details", hrm: "HRM" };
const DEFAULT_ROLES = [
  { id: "admin", name: "Admin" },
  { id: "manager", name: "Manager" },
  { id: "employee", name: "Employee" },
];

const MARKETING_TEAM_ROLES = [
  { id: "sales", name: "Sales" },
  { id: "digital-sales", name: "Digital Sales" },
  { id: "digital-marketing", name: "Digital Marketing" },
  { id: "telesales", name: "Telesales" },
  { id: "marketing-head", name: "Marketing Head" },
  { id: "marketing-manager", name: "Marketing Manager" },
  { id: "marketing-executive", name: "Marketing Executive" },
];

const mergeRoles = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((role) => role && typeof role === "object").filter((role) => {
    const name = role?.name || role?.role_name || String(role || "");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function Users() {
  // ← NEW: Get permissions
  const { hasPermission, loaded: permsLoaded, isAdmin } = usePermissions();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [errors, setErrors] = useState({});
  const [showDelete, setShowDelete] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showFormConfirmPassword, setShowFormConfirmPassword] = useState(false);

  // Reset password states
  const [showReset, setShowReset] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  const currentTabIndex = TABS.indexOf(activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === TABS.length - 1;

  // ← NEW: Helper to check if user has a specific permission
  const canView = () => isAdmin || hasPermission("User", "View user");
  const canAdd = () => isAdmin || hasPermission("User", "Add user");
  const canEdit = () => isAdmin || hasPermission("User", "Edit user");
  const canDelete = () => isAdmin || hasPermission("User", "Delete user");
  const canResetPassword = () => isAdmin || hasPermission("User", "Edit user"); // Uses same perm as edit (or could be separate)

  useEffect(() => { loadUsers(); loadRoles(); }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setApiError("");
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const data = await fetchAllRoles();
      setRoles(data || []);
    } catch (err) {
      console.error("Failed to load roles:", err.message);
    }
  };

  const goNext = () => { if (!isLastTab) setActiveTab(TABS[currentTabIndex + 1]); };
  const goPrev = () => { if (!isFirstTab) setActiveTab(TABS[currentTabIndex - 1]); };

  const openAdd = () => {
    setForm(emptyForm); setErrors({}); setModalMode("add");
    setShowFormPassword(false); setShowFormConfirmPassword(false);
    setActiveTab("basic"); setShowModal(true); setApiError("");
  };

  const openEdit = (user) => {
    const nameParts = (user.full_name || "").trim().split(/\s+/).filter(Boolean);
    const knownPrefixes = ["Mr", "Mrs", "Ms", "Dr", "Er"];
    const hasPrefix = knownPrefixes.includes((nameParts[0] || "").replace(/\.$/, ""));
    setForm({
      ...emptyForm,
      prefix: hasPrefix ? nameParts[0].replace(/\.$/, "") : "",
      firstName: hasPrefix ? (nameParts[1] || "") : (nameParts[0] || ""),
      lastName: nameParts.slice(hasPrefix ? 2 : 1).join(" "),
      email: user.email,
      username: user.email,
      role: user.role || "employee",
      department: user.department || "",
      mobile: user.phone || "",
      isActive: user.status === "active",
      basicSalary: user.basic_salary ?? "",
      salaryPeriod: user.salary_period || "Per Month",
    });
    setEditId(user.id); setErrors({}); setModalMode("edit");
    setShowFormPassword(false); setShowFormConfirmPassword(false);
    setActiveTab("basic"); setShowModal(true); setApiError("");
  };

  const openView = (user) => {
    const nameParts = (user.full_name || "").split(" ");
    setForm({
      ...emptyForm,
      prefix: nameParts[0] || "",
      firstName: nameParts[1] || nameParts[0] || "",
      lastName: nameParts.slice(2).join(" "),
      email: user.email,
      username: user.email,
      role: user.role || "employee",
      department: user.department || "",
      mobile: user.phone || "",
      isActive: user.status === "active",
      basicSalary: user.basic_salary ?? "",
      salaryPeriod: user.salary_period || "Per Month",
    });
    setEditId(user.id); setModalMode("view");
    setActiveTab("basic"); setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "First Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email";
    if (modalMode === "add") {
      if (!form.password) e.password = "Password is required";
      if (!form.confirmPassword) e.confirmPassword = "Please confirm password";
      else if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    } else if (form.password || form.confirmPassword) {
      if (form.password.length < 6) e.password = "Password must be at least 6 characters";
      if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    }
    if (!form.role) e.role = "Role is required";
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      if (e.firstName || e.email || e.password || e.confirmPassword || e.role) setActiveTab("basic");
      return;
    }
    try {
      setSaving(true);
      setApiError("");
      const fullName = [form.prefix, form.firstName, form.lastName].filter(Boolean).join(" ");

      if (modalMode === "add") {
        await createUser({
          email: form.email,
          password: form.password,
          full_name: fullName,
          phone: form.mobile || null,
          role: form.role.toLowerCase(),
          department: form.department || null,
        });
      } else {
        await updateUser(editId, {
          email: form.email,
          full_name: fullName,
          phone: form.mobile || null,
          role: form.role.toLowerCase(),
          department: form.department || null,
          basic_salary: form.basicSalary === "" ? 0 : Number(form.basicSalary),
          salary_period: form.salaryPeriod,
          status: form.isActive ? "active" : "inactive",
          basic_salary: form.basicSalary === "" ? 0 : Number(form.basicSalary),
          salary_period: form.salaryPeriod,
          ...(form.password ? { password: form.password } : {}),
        });
      }

      await loadUsers();
      setShowModal(false);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteUser(id);
      await loadUsers();
      setShowDelete(null);
    } catch (err) {
      setApiError(err.message);
      setShowDelete(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords do not match");
      return;
    }
    try {
      setResetSaving(true);
      setResetError("");
      await resetUserPassword(showReset.id, resetPassword);
      setShowReset(null);
      setResetPassword("");
      setResetConfirm("");
      alert(`✅ Password reset successfully for ${showReset.full_name || showReset.email}`);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetSaving(false);
    }
  };

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.role || "").toLowerCase().includes(search.toLowerCase())
  );
  const roleOptions = mergeRoles(roles.length ? roles : DEFAULT_ROLES, MARKETING_TEAM_ROLES);

  // ────────── EXPORT CSV ──────────
  const exportCSV = () => {
    const headers = ["Full Name", "Email", "Role", "Department", "Status"];
    const csvContent = [
      headers.join(","),
      ...users.map(u => [
        `"${u.full_name || ""}"`,
        `"${u.email || ""}"`,
        `"${u.role || ""}"`,
        `"${u.department || ""}"`,
        `"${u.status || ""}"`,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "users.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ────────── EXPORT EXCEL ──────────
  const exportExcel = () => {
    const data = users.map(u => ({
      "Full Name": u.full_name || "-",
      "Email": u.email || "-",
      "Role": u.role || "-",
      "Department": u.department || "-",
      "Status": u.status || "-",
      "Phone": u.phone || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 25 },
      { wch: 12 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
    XLSX.writeFile(workbook, "users.xlsx");
  };

  // ────────── PRINT ──────────
  const handlePrint = () => {
    const printWindow = window.open("", "", "height=600,width=800");
    const htmlContent = `
      <html>
        <head>
          <title>Users List</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 20px; }
            h2 { color: #1e2d1e; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background-color: #f8fdf9; color: #374151; padding: 12px; text-align: left; border-bottom: 2px solid #eaf1ec; }
            td { padding: 12px; border-bottom: 1px solid #f0f4f1; }
            tr:nth-child(even) { background-color: #fafcfa; }
            .status-active { background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; }
            .status-inactive { background-color: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 4px; }
            .role-badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
            .role-admin { background-color: #dcfce7; color: #166534; }
            .role-manager { background-color: #dbeafe; color: #1d4ed8; }
            .role-employee { background-color: #fef9c3; color: #854d0e; }
            @media print {
              body { margin: 0; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h2>Users List - ${new Date().toLocaleDateString()}</h2>
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>${u.full_name || "-"}</td>
                  <td>${u.email || "-"}</td>
                  <td><span class="role-badge role-${u.role || "employee"}">${u.role || "-"}</span></td>
                  <td>${u.department || "-"}</td>
                  <td><span class="status-${u.status || "active"}">${u.status || "-"}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  // ────────── EXPORT PDF ──────────
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Users List", 14, 15);
    autoTable(doc, {
      head: [["Name", "Email", "Role", "Department", "Status"]],
      body: users.map((u) => [u.full_name, u.email, u.role, u.department || "-", u.status]),
    });
    doc.save("users.pdf");
  };

  const f = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // ← NEW: Show "No Permission" message instead of disabled page
  if (permsLoaded && !canView()) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: 16,
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        <div style={{ fontSize: 64 }}>🔒</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1a202c", margin: 0 }}>
          Access Denied
        </h2>
        <p style={{ color: "#718096", fontSize: 15, textAlign: "center", maxWidth: 400 }}>
          You don't have permission to view the Users page.
          Contact your administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#1e2d1e" }}>Users</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "14px" }}>Manage users</p>
        </div>
        {/* ← NEW: Add User button only shows if user has permission */}
        {canAdd() && (
          <button onClick={openAdd} style={{
            background: "linear-gradient(135deg, #2d6a4f, #40916c)",
            color: "#fff", border: "none", borderRadius: "10px",
            padding: "10px 22px", fontWeight: 700, fontSize: "14px",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
            boxShadow: "0 3px 10px rgba(45,106,79,0.3)",
          }}>
            <span style={{ fontSize: "18px" }}>+</span> Add User
          </button>
        )}
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", color: "#dc2626", fontSize: "14px" }}>
          ⚠️ {apiError}
        </div>
      )}

      {/* Table Card */}
      <div style={{ background: "#fff", borderRadius: "14px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid #eaf1ec", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #f0f4f1", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontWeight: 700, fontSize: "16px", color: "#1e2d1e" }}>All Users ({users.length})</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={exportCSV}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #d1fae5", background: "#f0fdf4", color: "#2d6a4f", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              📊 Export CSV
            </button>
            <button onClick={exportExcel}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #d1fae5", background: "#f0fdf4", color: "#2d6a4f", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              📑 Export Excel
            </button>
            <button onClick={handlePrint}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #d1fae5", background: "#f0fdf4", color: "#2d6a4f", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              🖨️ Print
            </button>
            <button onClick={exportPDF}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #d1fae5", background: "#f0fdf4", color: "#2d6a4f", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              📄 Export PDF
            </button>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13px", outline: "none", width: "180px" }} />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>⏳ Loading users...</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#f8fdf9" }}>
                  {["Full Name", "Email", "Role", "Department", "Status", "Action"].map(h => (
                    <th key={h} style={{ padding: "12px 18px", textAlign: "left", color: "#374151", fontWeight: 600, fontSize: "13px", borderBottom: "2px solid #eaf1ec" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f0f4f1", background: i % 2 === 0 ? "#fff" : "#fafcfa" }}>
                    <td style={{ padding: "13px 18px", fontWeight: 600, color: "#1e2d1e" }}>{u.full_name || "-"}</td>
                    <td style={{ padding: "13px 18px", color: "#6b7280", fontSize: "13px" }}>{u.email}</td>
                    <td style={{ padding: "13px 18px" }}>
                      <span style={{
                        padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                        background: u.role === "admin" ? "#dcfce7" : u.role === "manager" ? "#dbeafe" : "#fef9c3",
                        color: u.role === "admin" ? "#166534" : u.role === "manager" ? "#1d4ed8" : "#854d0e",
                      }}>{u.role}</span>
                    </td>
                    <td style={{ padding: "13px 18px", color: "#374151" }}>{u.department || "-"}</td>
                    <td style={{ padding: "13px 18px" }}>
                      <span style={{
                        padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                        background: u.status === "active" ? "#dcfce7" : "#fef2f2",
                        color: u.status === "active" ? "#166534" : "#dc2626",
                      }}>{u.status}</span>
                    </td>
                    <td style={{ padding: "13px 18px" }}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {/* ← NEW: Show buttons ONLY if user has permission */}
                        {canView() && (
                          <button onClick={() => openView(u)} style={actionBtn("#2563eb", "#eff6ff")}>👁 View</button>
                        )}
                        {canEdit() && (
                          <button onClick={() => openEdit(u)} style={actionBtn("#2d6a4f", "#f0fdf4")}>✏️ Edit</button>
                        )}
                        {canResetPassword() && (
                          <button onClick={() => { setShowReset(u); setResetPassword(""); setResetConfirm(""); setResetError(""); }}
                            style={actionBtn("#d97706", "#fffbeb")}>🔑 Reset</button>
                        )}
                        {canDelete() && (
                          <button onClick={() => setShowDelete(u.id)} style={actionBtn("#dc2626", "#fef2f2")}>🗑 Delete</button>
                        )}
                        {!canView() && !canEdit() && !canDelete() && !canResetPassword() && (
                          <span style={{ fontSize: "12px", color: "#9ca3af" }}>No permissions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#9ca3af" }}>No users found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f4f1", color: "#6b7280", fontSize: "13px" }}>
          Showing 1 to {filtered.length} of {filtered.length} entries
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: "28px", color: "#9ca3af", fontSize: "12px" }}>
        manod tecnologies - V7.0 | Copyright © 2026 All rights reserved.
      </div>

      {/* ── Delete Confirm Modal ── */}
      {showDelete && (
        <div style={overlay}>
          <div style={{ ...modalBox, maxWidth: "380px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", color: "#1e2d1e" }}>Delete User?</h3>
            <p style={{ color: "#6b7280", margin: "0 0 22px", fontSize: "14px" }}>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={() => setShowDelete(null)} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={() => handleDelete(showDelete)} style={{ ...primaryBtnStyle, background: "#dc2626" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {showReset && (
        <div style={overlay}>
          <div style={{ ...modalBox, maxWidth: "420px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e2d1e" }}>🔑 Reset Password</h3>
              <button onClick={() => setShowReset(null)} style={{ border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#166534" }}>
                Setting new password for: <strong>{showReset.full_name || showReset.email}</strong>
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6b7280" }}>{showReset.email}</p>
            </div>

            {resetError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", color: "#dc2626", fontSize: "13px" }}>
                ⚠️ {resetError}
              </div>
            )}

            <div style={{ marginBottom: "14px" }}>
              <label style={lbl}>New Password <span style={{ color: "#dc2626" }}>*</span></label>
              <input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                style={{ ...inp, marginTop: "5px" }}
                placeholder="Minimum 6 characters"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={lbl}>Confirm New Password <span style={{ color: "#dc2626" }}>*</span></label>
              <input
                type="password"
                value={resetConfirm}
                onChange={e => setResetConfirm(e.target.value)}
                style={{ ...inp, marginTop: "5px" }}
                placeholder="Re-enter new password"
              />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowReset(null)} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={handleResetPassword} disabled={resetSaving}
                style={{ ...primaryBtnStyle, background: "linear-gradient(135deg, #d97706, #b45309)" }}>
                {resetSaving ? "⏳ Saving..." : "🔑 Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit / View Modal ── */}
      {showModal && (
        <div style={overlay}>
          <div style={{ ...modalBox, maxWidth: "700px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e2d1e" }}>
                {modalMode === "add" ? "Add User" : modalMode === "edit" ? "Edit User" : "View User"}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>

            {apiError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#dc2626", fontSize: "13px" }}>
                ⚠️ {apiError}
              </div>
            )}

            {/* Step Progress Bar */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: "24px" }}>
              {TABS.map((tab, idx) => {
                const isDone = idx < currentTabIndex;
                const isActive = idx === currentTabIndex;
                return (
                  <div key={tab} style={{ display: "flex", alignItems: "center", flex: idx < TABS.length - 1 ? 1 : "unset" }}>
                    <div
                      onClick={() => (modalMode === "view" || idx <= currentTabIndex) && setActiveTab(tab)}
                      style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: isDone ? "#2d6a4f" : isActive ? "linear-gradient(135deg,#2d6a4f,#40916c)" : "#e5e7eb",
                        color: isDone || isActive ? "#fff" : "#9ca3af",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: isDone ? "14px" : "13px", fontWeight: 700,
                        cursor: (modalMode === "view" || idx <= currentTabIndex) ? "pointer" : "default",
                        boxShadow: isActive ? "0 3px 10px rgba(45,106,79,0.35)" : "none",
                        flexShrink: 0, transition: "all .2s",
                        border: isActive ? "2px solid #2d6a4f" : "2px solid transparent",
                      }}>
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", top: 36, left: "50%", transform: "translateX(-50%)",
                        fontSize: "10px", fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#2d6a4f" : isDone ? "#374151" : "#9ca3af",
                        whiteSpace: "nowrap",
                      }}>{TAB_LABELS[tab]}</span>
                    </div>
                    {idx < TABS.length - 1 && (
                      <div style={{ flex: 1, height: 3, margin: "0 6px", background: isDone ? "#2d6a4f" : "#e5e7eb", borderRadius: 2, transition: "background .2s" }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ height: 20 }} />

            {/* ── BASIC TAB ── */}
            {activeTab === "basic" && (
              <div>
                <div style={row3}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Prefix</label>
                    <select disabled={modalMode === "view"} value={form.prefix} onChange={f("prefix")} style={inp}>
                      <option value="">Select</option>
                      {["Mr", "Mrs", "Ms", "Dr", "Er"].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>First Name <span style={{ color: "#dc2626" }}>*</span></label>
                    <input disabled={modalMode === "view"} value={form.firstName} onChange={f("firstName")}
                      style={{ ...inp, borderColor: errors.firstName ? "#dc2626" : "#d1d5db" }} placeholder="First Name" />
                    {errors.firstName && <span style={errTxt}>{errors.firstName}</span>}
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Last Name</label>
                    <input disabled={modalMode === "view"} value={form.lastName} onChange={f("lastName")} style={inp} placeholder="Last Name" />
                  </div>
                </div>
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Email <span style={{ color: "#dc2626" }}>*</span></label>
                    <input disabled={modalMode === "view"} type="email" value={form.email} onChange={f("email")}
                      style={{ ...inp, borderColor: errors.email ? "#dc2626" : "#d1d5db" }} placeholder="Email" />
                    {errors.email && <span style={errTxt}>{errors.email}</span>}
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Mobile Number</label>
                    <input disabled={modalMode === "view"} value={form.mobile} onChange={f("mobile")} style={inp} placeholder="+91" />
                  </div>
                </div>
                {modalMode !== "view" && (
                  <div style={row2}>
                    <div style={fieldWrap}>
                      <label style={lbl}>Password {modalMode === "add" && <span style={{ color: "#dc2626" }}>*</span>}</label>
                      <div style={{ position: "relative" }}>
                        <input type={isAdmin && showFormPassword ? "text" : "password"} value={form.password} onChange={f("password")}
                          autoComplete="new-password"
                          style={{ ...inp, paddingRight: isAdmin ? "44px" : inp.padding, borderColor: errors.password ? "#dc2626" : "#d1d5db" }}
                          placeholder={modalMode === "edit" ? "Leave blank to keep current" : "Password"} />
                        {isAdmin && <button type="button" onClick={() => setShowFormPassword(v => !v)}
                          aria-label={showFormPassword ? "Hide password" : "Show password"}
                          title={showFormPassword ? "Hide password" : "Show password"}
                          style={passwordEyeStyle}>{showFormPassword ? "Hide" : "Show"}</button>}
                      </div>
                      {errors.password && <span style={errTxt}>{errors.password}</span>}
                    </div>
                    <div style={fieldWrap}>
                      <label style={lbl}>Confirm Password {modalMode === "add" && <span style={{ color: "#dc2626" }}>*</span>}</label>
                      <div style={{ position: "relative" }}>
                        <input type={isAdmin && showFormConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={f("confirmPassword")}
                          autoComplete="new-password"
                          style={{ ...inp, paddingRight: isAdmin ? "44px" : inp.padding, borderColor: errors.confirmPassword ? "#dc2626" : "#d1d5db" }} placeholder="Confirm Password" />
                        {isAdmin && <button type="button" onClick={() => setShowFormConfirmPassword(v => !v)}
                          aria-label={showFormConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                          title={showFormConfirmPassword ? "Hide password" : "Show password"}
                          style={passwordEyeStyle}>{showFormConfirmPassword ? "Hide" : "Show"}</button>}
                      </div>
                      {errors.confirmPassword && <span style={errTxt}>{errors.confirmPassword}</span>}
                    </div>
                  </div>
                )}
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Role <span style={{ color: "#dc2626" }}>*</span></label>
                    <select disabled={modalMode === "view"} value={form.role} onChange={f("role")}
                      style={{ ...inp, borderColor: errors.role ? "#dc2626" : "#d1d5db" }}>
                      <option value="">Select Role</option>
                      {roleOptions.map((r) => (
                        <option key={r.id || r.role_name} value={(r.name || r.role_name).toLowerCase()}>{r.name || r.role_name}</option>
                      ))}
                    </select>
                    {errors.role && <span style={errTxt}>{errors.role}</span>}
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Status</label>
                    <select disabled={modalMode === "view"} value={form.isActive ? "active" : "inactive"}
                      onChange={e => setForm({ ...form, isActive: e.target.value === "active" })} style={inp}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── SALES TAB ── */}
            {activeTab === "sales" && (
              <div>
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Sales Commission Percentage (%)</label>
                    <input disabled={modalMode === "view"} type="number" value={form.salesCommission} onChange={f("salesCommission")} style={inp} placeholder="0.00" />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Max Sales Discount Percent</label>
                    <input disabled={modalMode === "view"} type="number" value={form.maxDiscount} onChange={f("maxDiscount")} style={inp} placeholder="0.00" />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Allow Selected Contacts</label>
                  <textarea disabled={modalMode === "view"} value={form.allowContacts} onChange={f("allowContacts")}
                    style={{ ...inp, height: "80px", resize: "vertical" }} placeholder="Enter contact names..." />
                </div>
              </div>
            )}

            {/* ── PERSONAL TAB ── */}
            {activeTab === "personal" && (
              <div>
                <div style={row3}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Date of Birth</label>
                    <input disabled={modalMode === "view"} type="date" value={form.dob} onChange={f("dob")} style={inp} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Gender</label>
                    <select disabled={modalMode === "view"} value={form.gender} onChange={f("gender")} style={inp}>
                      <option value="">Please Select</option>
                      <option>Male</option><option>Female</option><option>Others</option>
                    </select>
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Marital Status</label>
                    <select disabled={modalMode === "view"} value={form.maritalStatus} onChange={f("maritalStatus")} style={inp}>
                      <option value="">Marital Status</option>
                      <option>Married</option><option>Unmarried</option><option>Divorced</option>
                    </select>
                  </div>
                </div>
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Permanent Address</label>
                    <textarea disabled={modalMode === "view"} value={form.permanentAddress} onChange={f("permanentAddress")}
                      style={{ ...inp, height: "70px", resize: "vertical" }} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Current Address</label>
                    <textarea disabled={modalMode === "view"} value={form.currentAddress} onChange={f("currentAddress")}
                      style={{ ...inp, height: "70px", resize: "vertical" }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── BANK TAB ── */}
            {activeTab === "bank" && (
              <div>
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Account Holder's Name</label>
                    <input disabled={modalMode === "view"} value={form.accountHolder} onChange={f("accountHolder")} style={inp} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Account Number</label>
                    <input disabled={modalMode === "view"} value={form.accountNumber} onChange={f("accountNumber")} style={inp} />
                  </div>
                </div>
                <div style={row3}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Bank Name</label>
                    <input disabled={modalMode === "view"} value={form.bankName} onChange={f("bankName")} style={inp} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Bank Identifier Code</label>
                    <input disabled={modalMode === "view"} value={form.bankCode} onChange={f("bankCode")} style={inp} />
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Branch</label>
                    <input disabled={modalMode === "view"} value={form.branch} onChange={f("branch")} style={inp} />
                  </div>
                </div>
              </div>
            )}

            {/* ── HRM TAB ── */}
            {activeTab === "hrm" && (
              <div>
                <div style={row2}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Department</label>
                    <select disabled={modalMode === "view"} value={form.department} onChange={f("department")} style={inp}>
                      <option value="">Please Select</option>
                      <option>Digital Marketing</option>
                      <option>Sales</option>
                      <option>HR</option>
                      <option>Finance</option>
                      <option>Operations</option>
                    </select>
                  </div>
                  <div style={fieldWrap}>
                    <label style={lbl}>Basic Salary</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input disabled={modalMode === "view"} type="number" value={form.basicSalary} onChange={f("basicSalary")}
                        style={{ ...inp, flex: 1 }} placeholder="0.00" />
                      <select disabled={modalMode === "view"} value={form.salaryPeriod} onChange={f("salaryPeriod")} style={{ ...inp, width: "120px" }}>
                        <option>Per Month</option>
                        <option>Per Week</option>
                        <option>Per Day</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "28px", paddingTop: "16px", borderTop: "1px solid #eaf1ec" }}>
              <div>
                {isFirstTab ? (
                  <button onClick={() => setShowModal(false)} style={secondaryBtnStyle}>✕ Close</button>
                ) : (
                  <button onClick={goPrev} style={secondaryBtnStyle}>← Back</button>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>Step {currentTabIndex + 1} of {TABS.length}</span>
                {modalMode === "view" ? (
                  isLastTab ? (
                    <button onClick={() => setShowModal(false)} style={secondaryBtnStyle}>Close</button>
                  ) : (
                    <button onClick={goNext} style={primaryBtnStyle}>Next →</button>
                  )
                ) : modalMode === "edit" ? (
                  <>
                    {!isLastTab && <button onClick={goNext} style={secondaryBtnStyle}>Next →</button>}
                    <button onClick={handleSave} style={primaryBtnStyle} disabled={saving}>
                      {saving ? "Saving..." : "Update User"}
                    </button>
                  </>
                ) : isLastTab ? (
                  <button onClick={handleSave} style={primaryBtnStyle} disabled={saving}>
                    {saving ? "⏳ Saving..." : `💾 ${modalMode === "add" ? "Save User" : "Update User"}`}
                  </button>
                ) : (
                  <button onClick={goNext} style={primaryBtnStyle}>Next →</button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────
const actionBtn = (color, bg) => ({
  padding: "5px 10px", borderRadius: "7px", border: `1px solid ${color}20`,
  background: bg, color, fontSize: "12px", fontWeight: 600, cursor: "pointer",
});
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" };
const modalBox = { background: "#fff", borderRadius: "16px", padding: "28px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" };
const passwordEyeStyle = { position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#2d6a4f", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: "5px" };
const primaryBtnStyle = { background: "linear-gradient(135deg, #2d6a4f, #40916c)", color: "#fff", border: "none", borderRadius: "9px", padding: "10px 24px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const secondaryBtnStyle = { background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: "9px", padding: "10px 20px", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const fieldWrap = { display: "flex", flexDirection: "column", gap: "5px", flex: 1 };
const lbl = { fontSize: "12px", fontWeight: 600, color: "#374151" };
const inp = { padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "13px", outline: "none", width: "100%", boxSizing: "border-box", background: "#fff" };
const row2 = { display: "flex", gap: "14px", marginBottom: "14px" };
const row3 = { display: "flex", gap: "14px", marginBottom: "14px" };
const errTxt = { fontSize: "11px", color: "#dc2626" };
