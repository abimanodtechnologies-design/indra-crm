/**
 * ============================================================
 * src/featurePermissionMap.js  (FIXED v2 + Manufacturing merge)
 *
 * Root cause of anbu seeing Home + Notifications:
 *   FEATURES.DASHBOARD and FEATURES.NOTIFICATIONS had no entry
 *   in this map → checker was undefined → App.jsx did
 *   `if (!checker) return true` → always showed to everyone.
 *
 * Fix: every FEATURE now has an explicit checker.
 *
 * v3 change: PRODUCTION_PLANNING removed — Production Planning
 * is now a submenu under Manufacturing and inherits its checker.
 * ============================================================
 */
import { FEATURES } from "./planAccess";

export const FEATURE_PERM_MAP = {

  // ── Dashboard ─────────────────────────────────────────────
  // "View Home data" is in DB under group "Home"
  // Every role that should see the dashboard gets this permission.
  // If a role has NO permissions at all, they still see Home —
  // that's intentional (they need somewhere to land after login).
  [FEATURES.DASHBOARD]: (hp) =>
    hp("Home", "View Home data"),

  // ── Notifications ─────────────────────────────────────────
  // No specific DB permission exists for notifications.
  // Only show it to admin-tier roles (handled by isAdmin bypass)
  // and to roles that have Settings access.
  // For everyone else (Cashier, Sales Exec, etc.) — hide it.
  [FEATURES.NOTIFICATIONS]: (hp) =>
    hp("Settings", "Access business settings") ||
    hp("Settings", "Access invoice settings")  ||
    hp("Settings", "Access barcode settings")  ||
    hp("Settings", "Access printers"),

  // ── User Management ───────────────────────────────────────
  [FEATURES.USER_MANAGEMENT]: (hp) =>
    hp("User",  "View user") ||
    hp("Roles", "View role"),

  // ── Contacts ──────────────────────────────────────────────
  [FEATURES.CONTACTS]: (hp) =>
    hp("Customer", "View all customer")  ||
    hp("Customer", "View own customer")  ||
    hp("Supplier", "View all supplier")  ||
    hp("Supplier", "View own supplier"),

  // ── Products ──────────────────────────────────────────────
  [FEATURES.PRODUCTS]: (hp) =>
    hp("Product", "View product"),

  // ── Manufacturing ─────────────────────────────────────────
  // Also covers Production Planning (now a submenu under Manufacturing).
  [FEATURES.MANUFACTURING]: (hp) =>
    hp("Manufacturing", "View Recipe") ||
    hp("Manufacturing", "Access Production"),

  // NOTE: PRODUCTION_PLANNING removed — it is nested under Manufacturing
  // and shares the same permission checker above.

  // ── Purchases ─────────────────────────────────────────────
  [FEATURES.PURCHASES]: (hp) =>
    hp("Purchase", "View all Purchase") ||
    hp("Purchase", "View own Purchase"),

  // ── Sell ──────────────────────────────────────────────────
  [FEATURES.SELL]: (hp) =>
    hp("Sell", "View all sell")       ||
    hp("Sell", "View own sell only")  ||
    hp("Sell", "View paid sells only"),

  // ── POS ───────────────────────────────────────────────────
  [FEATURES.POS]: (hp) =>
    hp("POS", "View POS sell") ||
    hp("POS", "Add POS sell"),

  // ── Stock Transfers ───────────────────────────────────────
  [FEATURES.STOCK_TRANSFERS]: (hp) =>
    hp("Stock Transfer", "View all stock transfer") ||
    hp("Stock Transfer", "View own stock transfer"),

  // ── Stock Adjustment ──────────────────────────────────────
  [FEATURES.STOCK_ADJUSTMENT]: (hp) =>
    hp("Stock Adjustment", "View all stock adjustment") ||
    hp("Stock Adjustment", "View own stock adjustment"),

  // ── Expenses ──────────────────────────────────────────────
  [FEATURES.EXPENSES]: (hp) =>
    hp("Expense", "Access all expenses") ||
    hp("Expense", "View own expense only"),

  // ── Reports ───────────────────────────────────────────────
  [FEATURES.REPORTS]: (hp) =>
    hp("Report", "View profit/loss report")          ||
    hp("Report", "View purchase & sell report")      ||
    hp("Report", "View stock report, stock adjustment report & stock expiry report") ||
    hp("Report", "View expense report")              ||
    hp("Report", "View Tax report")                  ||
    hp("Report", "View Supplier & Customer report")  ||
    hp("Report", "View trending product report")     ||
    hp("Report", "View register report"),

  // ── Settings ──────────────────────────────────────────────
  [FEATURES.SETTINGS]: (hp) =>
    hp("Settings", "Access business settings") ||
    hp("Settings", "Access barcode settings")  ||
    hp("Settings", "Access invoice settings")  ||
    hp("Settings", "Access printers"),

  // ── CRM ───────────────────────────────────────────────────
  [FEATURES.CRM]: (hp) =>
    hp("Crm", "Access all follow up")  ||
    hp("Crm", "Access own follow up")  ||
    hp("Crm", "Access all leads")      ||
    hp("Crm", "Access own leads"),

  // ── HRM ───────────────────────────────────────────────────
  [FEATURES.HRM]: (hp) =>
    hp("Essentials", "View all Payroll")               ||
    hp("Essentials", "Add/Edit/View/Delete all leave") ||
    hp("Essentials", "Add/Edit/View/Delete all attendance"),

  // ── Essentials ────────────────────────────────────────────
  [FEATURES.ESSENTIALS]: (hp) =>
    hp("Essentials", "View Message")    ||
    hp("Essentials", "Create Message")  ||
    hp("Essentials", "Add To Do's")     ||
    hp("Essentials", "Add/View own leave"),

};
