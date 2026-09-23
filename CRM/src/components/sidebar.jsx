/**
 * ============================================================
 * components/Sidebar.jsx â€” Standalone CRM version
 * ============================================================
 */

import "../styles/Sidebar.css";
import manodLogo from "../assets/manod-logo.jpg";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HeartHandshake, Search, ChevronDown, LogOut } from "lucide-react";
import { hasFeature, FEATURES } from "../planAccess";
import { usePermissions } from "../context/PermissionsContext";
import * as crmAPI from "../api/crmAPI";

const navItems = [
  
  {
    label: "CRM", icon: HeartHandshake, path: "/crm", feature: FEATURES.CRM,
    children: [
      { label: "Dashboard",        path: "/crm", adminOnly: true },
      { label: "Leads",            path: "/crm/leads", salesAllowed: true },
      { label: "Pending Follow Ups", path: "/crm/follow-ups", salesAllowed: true },
      { label: "Proposals",        path: "/crm/proposals", adminOnly: true },
      { label: "Payments",         path: "/crm/payment-reminders", adminOnly: true },
      { label: "Customer Success", path: "/crm/customer-success", adminOnly: true },
      { label: "Machines & Service", path: "/crm/machines", permission: ["Machine Service", "View machine service"], industry: "machine" },
      { label: "Export Workspace", path: "/crm/export", adminOnly: true, industry: "export" },
      { label: "Real Estate", path: "/crm/real-estate", adminOnly: true, industry: "real_estate" },
      { label: "Contacts",         path: "/crm/contacts", adminOnly: true },
      { label: "Campaigns",        path: "/crm/campaigns", adminOnly: true },
      { label: "Sources",          path: "/crm/sources", adminOnly: true },
      { label: "Reports",          path: "/crm/reports", adminOnly: true },
      { label: "Users",            path: "/crm/users", feature: FEATURES.USER_MANAGEMENT, adminOnly: true },
      { label: "Settings",         path: "/crm/settings", adminOnly: true },
    ],
  },

];

function childMatches(c, pathname) {
  if (c.path === "/crm") return pathname === "/crm";

  if (c.path === "/crm/follow-ups") return pathname === c.path || pathname === "/crm/followups" || pathname.startsWith(c.path + "/") || pathname.startsWith("/crm/followups/");
  return pathname === c.path || pathname.startsWith(c.path + "/");
}

function checkActive(item, pathname) {
  if (item.children) return item.children.some((c) => childMatches(c, pathname));
  if (item.path === "/") return pathname === "/";
  return pathname.startsWith(item.path);
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(() => navItems.find((it) => checkActive(it, location.pathname))?.label || null);
  const [search, setSearch] = useState("");
  const [crmIndustry, setCrmIndustry] = useState("general");
  const [brand, setBrand] = useState({ companyName: "Manod CRM", logo: "" });
  const [theme, setTheme] = useState({ mode: "light", primaryColor: "#1f6b45", sidebarBackground: "#0b2b1d", activeMenuColor: "#dff2e6" });

  const { hasPermission, isAdmin, userName, userRole, userAvatar } = usePermissions();
  const normalizedRole = String(userRole || "").toLowerCase();
  const isSalesRole = normalizedRole.includes("sales") || normalizedRole.includes("marketing");

  useEffect(() => {
    crmAPI.fetchSettings().then(({ settings }) => {
      setCrmIndustry(settings?.crm_industry || "general");
      const b = settings?.branding || {};
      const t = settings?.theme || {};
      setBrand({ companyName: settings?.company_name || "Manod CRM", logo: b.logo || "" });
      if (b.favicon) {
        let icon = document.querySelector('link[rel="icon"]');
        if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
        icon.href = b.favicon;
      }
      setTheme({ mode: "light", primaryColor: "#1f6b45", sidebarBackground: "#0b2b1d", activeMenuColor: "#dff2e6", customCss: "", fontFamily: "Inter", fontSize: "medium", ...t });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--crm-primary', theme.primaryColor);
    root.style.setProperty('--crm-sidebar-bg', theme.sidebarBackground);
    root.style.setProperty('--crm-active-menu', theme.activeMenuColor);
    root.style.setProperty('--sb-logo-bg', theme.sidebarBackground);
    root.style.setProperty('--sb-active-bg', theme.primaryColor);
    root.style.setProperty('--sb-active-text', theme.mode === 'dark' ? '#0b2b1d' : '#ffffff');
    root.style.setProperty('--sb-active-icon', theme.mode === 'dark' ? '#0b2b1d' : 'rgba(255,255,255,0.9)');
    root.style.setProperty('--crm-font-family', theme.fontFamily || 'Inter');
    root.style.setProperty('--crm-font-size', theme.fontSize === 'small' ? '13px' : theme.fontSize === 'large' ? '16px' : '14px');
    root.dataset.crmTheme = theme.mode || 'light';
    let custom = document.getElementById('crm-custom-css');
    if (!custom) { custom = document.createElement('style'); custom.id = 'crm-custom-css'; document.head.appendChild(custom); }
    custom.textContent = theme.customCss || '';
  }, [theme]);

  const visibleItems = navItems.filter((it) => hasFeature(it.feature) && (!it.adminOnly || isAdmin) && (isAdmin || it.label === "CRM" && isSalesRole));

  useEffect(() => {
    const activeMenu = navItems.find((it) => checkActive(it, location.pathname));
    if (activeMenu?.children) setOpenMenu(activeMenu.label);
  }, [location.pathname]);

  const handleLogout = (event) => {
    event?.stopPropagation();
    localStorage.removeItem("manod_token");
    localStorage.removeItem("manod_user");
    navigate("/login", { replace: true });
  };

  const q = search.toLowerCase().trim();
  const filtered = q
    ? visibleItems.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.children?.some((c) => c.label.toLowerCase().includes(q))
      )
    : visibleItems;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img src={brand.logo || manodLogo} alt={brand.companyName} className="sidebar-logo-img" />
        </div>
        <div>
          <div className="sidebar-logo-text">{brand.companyName || "Manod CRM"}</div>
          <div className="sidebar-logo-sub">Customer Management</div>
        </div>
      </div>

      <div className="sidebar-search">
        <span className="sidebar-search-icon"><Search size={14} /></span>
        <input
          className="sidebar-search-input"
          placeholder="Search menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <nav className="sidebar-nav">
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = checkActive(item, location.pathname);
          const open = openMenu === item.label;

          return (
            <div key={item.label} className="sidebar-item-wrapper">
              {item.children ? (
                <div
                  className={`sidebar-item${active ? " active" : ""}`}
                  onClick={() => setOpenMenu(open ? null : item.label)}
                >
                  <span className="sidebar-item-icon">{Icon && <Icon size={16} strokeWidth={1.8} />}</span>
                  <span className="sidebar-item-label">{item.label}</span>
                  <span className={`sidebar-chevron${open ? " rotated" : ""}`}>
                    <ChevronDown size={13} strokeWidth={2.2} />
                  </span>
                </div>
              ) : (
                <Link to={item.path} className={`sidebar-item${active ? " active" : ""}`}>
                  <span className="sidebar-item-icon">{Icon && <Icon size={16} strokeWidth={1.8} />}</span>
                  <span className="sidebar-item-label">{item.label}</span>
                </Link>
              )}

              {item.children && open && (
                <div className="sidebar-submenu">
                  {item.children
                    .filter((c) => !c.feature || hasFeature(c.feature))
                    .filter((c) => isAdmin || (isSalesRole && c.salesAllowed))
                    .filter((c) => !c.permission || isAdmin || hasPermission(c.permission[0], c.permission[1]))
                    .filter((c) => !c.industry || c.industry === crmIndustry)
                    .filter((c) => !q || c.label.toLowerCase().includes(q))
                    .map((child) => {
                      const ca = childMatches(child, location.pathname);
                      return (
                        <Link key={child.label} to={child.path} className={`sidebar-subitem${ca ? " active" : ""}`}>
                          <span className="sidebar-subitem-dot" />
                          {child.label}
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-user-card">
        <button
          type="button"
          className="sidebar-user"
          onClick={() => navigate("/profile")}
          title="Open profile"
        >
          <div className="sidebar-user-avatar">{userAvatar || "U"}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName || "User"}</div>
            <div className="sidebar-user-role">{userRole || "-"}</div>
          </div>
        </button>
        <button type="button" className="sidebar-logout-button" onClick={handleLogout} title="Logout">
          <LogOut size={14} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

