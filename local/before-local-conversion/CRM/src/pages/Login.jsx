import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Lock, Mail, MapPin } from "lucide-react";
import { usePermissions } from "../context/PermissionsContext";
import { API_BASE_URL } from "../api/config";


export default function Login() {
  const navigate = useNavigate();
  const { loadPermissions } = usePermissions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (localStorage.getItem("manod_token")) {
    return <Navigate to="/crm" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to login.");
      }

      localStorage.setItem("manod_token", data.token);
      localStorage.setItem("manod_user", JSON.stringify(data.user));
      await loadPermissions();
      navigate("/crm", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#f0f4f1",
      padding: 24,
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        border: "1px solid #dfe8e2",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(26, 61, 43, 0.12)",
        padding: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "#1a5c38",
            color: "#fff",
            display: "grid",
            placeItems: "center",
          }}>
            <MapPin size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#163625" }}>Manod CRM</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 700 }}>
              Customer Management
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <label style={labelStyle}>Email</label>
        <div style={fieldStyle}>
          <Mail size={16} color="#6b7280" />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            autoComplete="email"
            style={inputStyle}
          />
        </div>

        <label style={labelStyle}>Password</label>
        <div style={fieldStyle}>
          <Lock size={16} color="#6b7280" />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

        <button type="submit" disabled={loading} style={{
          width: "100%",
          marginTop: 10,
          background: "#1a5c38",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "11px 16px",
          fontWeight: 700,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.72 : 1,
        }}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  margin: "14px 0 6px",
};

const fieldStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "0 11px",
  background: "#fff",
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  height: 40,
  border: "none",
  outline: "none",
  fontSize: 14,
  background: "transparent",
};



