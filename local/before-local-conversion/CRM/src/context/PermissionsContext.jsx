import { createContext, useContext, useState, useEffect } from "react";
import { API_BASE_URL } from "../api/config";

const PermissionsContext = createContext({
  permissions: [],
  hasPermission: () => false,
  loaded: false,
  loadPermissions: async () => {},
  clearPermissions: () => {},
  isAdmin: false,
  userRole: "",
  userName: "",
  userEmail: "",
  userAvatar: "",
});

function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded;
  } catch {
    return null;
  }
}

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState(null);
  const [loaded,      setLoaded]      = useState(false);
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [userRole,    setUserRole]    = useState("");
  const [userName,    setUserName]    = useState("");
  const [userEmail,   setUserEmail]   = useState("");
  const [userAvatar,  setUserAvatar]  = useState("A");

  const loadPermissions = async () => {
    const token = localStorage.getItem("manod_token");
    if (!token) {
      setPermissions([]);
      setIsAdmin(false);
      setLoaded(true);
      return;
    }

    const jwt = decodeJWT(token);
    if (jwt) {
      const name  = jwt.full_name || jwt.name || jwt.email?.split("@")[0] || "User";
      const email = jwt.email || "";
      const role  = jwt.role  || "";
      setUserName(name);
      setUserEmail(email);
      setUserRole(role);
      setUserAvatar((name[0] || "U").toUpperCase());
    }

    try {
      const res  = await fetch(`${API_BASE_URL}/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setPermissions(data.permissions);
        setIsAdmin(!!data.isAdmin);
        if (data.role) {
          setUserRole(data.role);
        }
      } else {
        setPermissions([]);
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("Failed to load permissions:", err);
      try {
        const t = localStorage.getItem("manod_token");
        const j = t ? JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))) : null;
        if (j?.role === "Admin" || j?.is_admin === true || j?.isAdmin === true) {
          setIsAdmin(true);
          setPermissions([]);
        } else {
          setPermissions([]);
          setIsAdmin(false);
        }
      } catch {
        setPermissions([]);
        setIsAdmin(false);
      }
    } finally {
      setLoaded(true);
    }
  };

  const clearPermissions = () => {
    setPermissions([]);
    setIsAdmin(false);
    setLoaded(false);
    setUserRole("");
    setUserName("");
    setUserEmail("");
    setUserAvatar("A");
  };

  const hasPermission = (group, name) => {
    if (!permissions) return false;
    if (isAdmin) return true;
    return permissions.includes(`${group}::${name}`);
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  return (
    <PermissionsContext.Provider
      value={{
        permissions: permissions || [],
        hasPermission,
        loaded,
        loadPermissions,
        clearPermissions,
        isAdmin,
        userRole,
        userName,
        userEmail,
        userAvatar,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionsContext);


