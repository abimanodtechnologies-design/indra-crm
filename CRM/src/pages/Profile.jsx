import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Mail, ShieldCheck, UserRound, Building2, CheckCircle2 } from "lucide-react";
import { usePermissions } from "../context/PermissionsContext";

function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("manod_user") || "{}");
  } catch {
    return {};
  }
}

function getDisplayName(user, jwt, fallbackName) {
  return (
    user.full_name ||
    user.fullName ||
    user.name ||
    [user.prefix, user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean).join(" ") ||
    jwt?.full_name ||
    jwt?.name ||
    fallbackName ||
    jwt?.email?.split("@")[0] ||
    "User"
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { userName, userRole, userEmail, userAvatar, isAdmin, clearPermissions } = usePermissions();

  const profile = useMemo(() => {
    const storedUser = readStoredUser();
    const token = localStorage.getItem("manod_token");
    const jwt = token ? decodeJWT(token) : null;
    const name = getDisplayName(storedUser, jwt, userName);
    const email = storedUser.email || jwt?.email || userEmail || "-";
    const role = storedUser.role || storedUser.role_name || jwt?.role || userRole || "-";
    const department = storedUser.department || storedUser.department_name || jwt?.department || "-";
    const status = storedUser.status || (storedUser.is_active === false ? "Inactive" : "Active");
    const mobile = storedUser.mobile || storedUser.phone || storedUser.mobile_number || "-";

    return {
      name,
      email,
      role,
      department,
      status,
      mobile,
      avatar: (userAvatar || name?.[0] || "U").toUpperCase(),
      isAdmin: isAdmin || String(role).toLowerCase() === "admin",
    };
  }, [userName, userRole, userEmail, userAvatar, isAdmin]);

  const logout = () => {
    localStorage.removeItem("manod_token");
    localStorage.removeItem("manod_user");
    clearPermissions?.();
    navigate("/login", { replace: true });
  };

  return (
    <section style={{ padding: 24 }}>
      <div style={{ maxWidth: 920 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>My Profile</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>Logged-in user information</p>
        </div>

        <div style={{
          background: "#fff",
          border: "1px solid #dfe8e2",
          borderRadius: 10,
          boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 22,
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(180deg, #f8fbf9 0%, #ffffff 100%)",
          }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "#1f6b43",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 22,
            }}>
              {profile.avatar}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, color: "#102a1d", fontSize: 21 }}>{profile.name}</h2>
              <p style={{ margin: "5px 0 0", color: "#64748b" }}>{profile.email}</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, padding: 22 }}>
            <InfoCard icon={<UserRound size={18} />} label="Full Name" value={profile.name} />
            <InfoCard icon={<Mail size={18} />} label="Email" value={profile.email} />
            <InfoCard icon={<ShieldCheck size={18} />} label="Role" value={profile.role} />
            <InfoCard icon={<Building2 size={18} />} label="Department" value={profile.department} />
            <InfoCard icon={<CheckCircle2 size={18} />} label="Status" value={profile.status} />
            <InfoCard icon={<UserRound size={18} />} label="Mobile" value={profile.mobile} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "0 22px 22px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/crm")} style={secondaryButton}>Back to Dashboard</button>
            <button type="button" onClick={logout} style={dangerButton}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
        {icon} {label}
      </div>
      <div style={{ marginTop: 8, color: "#0f172a", fontWeight: 700, wordBreak: "break-word" }}>{value || "-"}</div>
    </div>
  );
}

const secondaryButton = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#1f2937",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButton = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};
