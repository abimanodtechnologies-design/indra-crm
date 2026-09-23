import LocalReminder from "./components/LocalReminder";
﻿import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PermissionsProvider } from "./context/PermissionsContext";
import Sidebar from "./components/sidebar";
import { CRMRoutes as CRM } from "./pages/CRM";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import PublicProposal from "./pages/PublicProposal";

import { FEATURES } from "./planAccess";
import { usePermissions } from "./context/PermissionsContext";
import "./App.css";

function isAuthenticated() {
  return !!localStorage.getItem("manod_token");
}

function PrivateRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}
function FeatureRoute({ children }) {
  return children;
}
function AdminRoute({ children }) {
  const { loaded, isAdmin } = usePermissions();
  if (!loaded) return null;
  return isAdmin ? children : <Navigate to="/crm/follow-ups" replace />;
}
function RoleLanding() {
  const { loaded, isAdmin, userRole } = usePermissions();
  if (!loaded) return null;
  if (isAdmin) return <CRM />;
  if (/sales|marketing/i.test(String(userRole || ""))) return <Navigate to="/crm/follow-ups" replace />;
  return <Navigate to="/profile" replace />;
}
function AppLayout() {
  return (
    <div style={{ minHeight: "100vh", overflow: "hidden", background: "#f0f4f1" }}>
      <Sidebar />
      <LocalReminder />
      <main style={{
        marginLeft: "260px",
        width: "calc(100vw - 260px)",
        minWidth: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#f0f4f1",
      }}>
        <Routes>
          <Route path="/"      element={<RoleLanding />} />
          <Route path="/crm/users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/crm/*" element={<FeatureRoute feature={FEATURES.CRM}><CRM /></FeatureRoute>} />
          <Route path="/hrms/*" element={<Navigate to="/crm" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <PermissionsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/proposal/:token" element={<PublicProposal />} />
          <Route path="/*" element={<PrivateRoute><AppLayout /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </PermissionsProvider>
  );
}

export default App;



