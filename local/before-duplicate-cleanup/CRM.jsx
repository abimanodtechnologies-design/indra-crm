import { CustomerSuccessDetails } from "../components/CustomerSuccessDetails";
import { EnquiryFields, EnquiryReport } from "../components/EnquiryWorkflow";
import { captureLocation } from "../utils/location";
import LocalBackupPanel from "../components/LocalBackupPanel";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, TrendingUp, Users, FileText, MessageSquare, Settings,
  Plus, Edit2, Trash2, Eye, Search, Download, Check,
  AlertCircle, Megaphone, UserCheck, PieChart, Globe,
  CheckCircle2, Phone, Mail, Calendar, X, ArrowRightLeft, Upload,
  Repeat2, ChevronDown, MapPin, DollarSign
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as crmAPI from "../api/crmAPI";
import ExportWorkspace from "./ExportWorkspace";
import RealEstateWorkspace from "./RealEstateWorkspace";
import IndustryDashboard from "./IndustryDashboard";
import { fetchAllUsers } from "../api/userApi";
import { usePermissions } from "../context/PermissionsContext";
import {
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart as ReLineChart,
  Line,
  PieChart as RePieChart,
  Pie,
  Cell
} from "recharts";

// ---------------------------------------------------------------------------
// DESIGN TOKENS & CONSTANTS
// ---------------------------------------------------------------------------
const COLORS = {
  primary: "#1a5c38", primaryLight: "#16a34a", secondary: "#0891b2",
  danger: "#dc2626", warning: "#d97706", success: "#15803d",
  info: "#2563eb", neutral: "#6b7280", purple: "#7c3aed",
  bg: "#f9fafb", bgCard: "#ffffff", border: "#e5e7eb",
};

const DEFAULT_USER_OPTIONS = [];

const toTitleCase = (value) => String(value || "")
  .replace(/[-_]+/g, " ")
  .replace(/\b\w/g, (ch) => ch.toUpperCase());

const getUserDisplayName = (user) => cleanText(user?.full_name || user?.name || user?.email || "", "");

const buildUserOptions = (registeredUsers = []) => {
  const seen = new Set();
  const options = [];
  const add = (value, label = value, userId = null) => {
    if (!value) return;
    const key = String(value).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ value, label, userId });
  };
  registeredUsers
    .filter((user) => String(user.status || "").toLowerCase() === "active")
    .forEach((user) => {
      const name = getUserDisplayName(user);
      const role = toTitleCase(user?.role);
      add(name, role ? name + " (" + role + ")" : name, user?.id || null);
      const option = options.find(o => o.userId === user.id);
      if (option) option.email = user.email;
    });

  return options;
};

const firstUserValue = (userOptions) => userOptions?.[0]?.value || "";
const userIdForValue = (userOptions, value) => userOptions.find((option) => option.value === value)?.userId || null;
const LEAD_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const MANUAL_LEAD_STAGES = LEAD_STAGES.filter((stage) => stage !== "Won");
const LEAD_STAGE_FLOW = ["New", "Contacted", "Qualified", "Proposal", "Negotiation"];
const LEAD_SOURCES = ["Visit", "Email", "WhatsApp", "Phone", "Website", "Referral", "Cold Call", "Exhibition", "Social Media", "Email Campaign", "Direct Contact"];
const FOLLOW_UP_TYPES = ["Call", "WhatsApp", "Email", "Customer Visit", "Technical Discussion", "Quotation Follow-up", "Payment Follow-up", "Other"];
const FOLLOW_UP_CATEGORIES = ["Enquiry", "Quotation", "Order", "Payment", "After-Sales", "Repeat Order"];
const FOLLOW_UP_STATUS = ["Scheduled", "Completed", "Cancelled", "Pending"];
const PROPOSAL_STATUS = ["Draft", "Sent", "Viewed", "Accepted", "Rejected", "Expired"];
const CONTACT_DESIGNATIONS = ["Decision Maker", "Influencer", "User", "Administrator", "Finance"];
const LIFE_STAGES = ["Lead", "Prospect", "Customer", "Inactive"];
const CUSTOMER_SUCCESS_STAGES = ["Order Confirmed","Order Processing","Purchase / Procurement","Stock Availability","Dispatch Planning","Invoice Generated","Dispatch","Delivery Confirmation","Payment Follow-up","After-Sales Follow-up","Complaint / Support","Feedback","Repeat Order Reminder","Cross-sell / Upsell","Lost / Cancelled Order"];
const PAYMENT_REMINDER_STAGES = ["Advance Payment Pending", "Advance Received", "Balance Payment Pending", "Overdue Payment", "Fully Paid"];
const PRODUCT_CATEGORIES = ["CNC Cutter", "Insert", "Tool Holder", "Tungalloy Tools", "Bilz Tools", "Planet Tools", "Other"];
const MACHINE_TYPES = ["Strapping Machine", "Other Equipment"];
const DASHBOARD_CHART_COLORS = ["#1a5c38", "#2563eb", "#7c3aed", "#d97706", "#0891b2", "#16a34a"];

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
const parseCurrencyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(parseCurrencyValue(v));

const chartCurrencyTick = (value) => {
  const amount = parseCurrencyValue(value);
  if (amount >= 10000000) return `₹${Math.round(amount / 10000000)}Cr`;
  if (amount >= 100000) return `₹${Math.round(amount / 100000)}L`;
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}K`;
  return `₹${amount}`;
};

const getInitials = (name) =>
  name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

const cleanText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value);
  return /[\u00c0-\uffff]/.test(text) ? fallback : text;
};

const formatDate = (dateStr) => {
  const value = cleanText(dateStr, "");
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
};

const formatDateTime = (dateStr) => {
  const value = cleanText(dateStr, "");
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const isTodayDate = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
};

const padDatePart = (value) => String(value).padStart(2, "0");

const parseDateTimeValue = (value) => {
  const text = cleanText(value, "").trim();
  if (!text) return null;

  const localMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (localMatch) {
    const [, day, month, year, hour = "0", minute = "0", meridian] = localMatch;
    let h = Number(hour);
    if (meridian) {
      const upper = meridian.toUpperCase();
      if (upper === "PM" && h < 12) h += 12;
      if (upper === "AM" && h === 12) h = 0;
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day), h, Number(minute));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateTimeLocalValue = (value) => {
  const date = parseDateTimeValue(value);
  if (!date) return "";
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
};

const dateInputValue = (value) => toDateTimeLocalValue(value).slice(0, 10);
const timeInputValue = (value) => toDateTimeLocalValue(value).slice(11, 16);

const updateDateTimePart = (value, part, nextValue) => {
  const normalized = toDateTimeLocalValue(value);
  const datePart = part === "date" ? nextValue : normalized.slice(0, 10);
  const timePart = part === "time" ? nextValue : (normalized.slice(11, 16) || "09:00");
  if (!datePart) return "";
  return `${datePart}T${timePart || "09:00"}`;
};
const normalizeLeadForForm = (lead, blankForm) => {
  const details = lead?.lead_details || {};
  const customFields = lead?.custom_fields || details.customFields || {};
  const contactPersons = lead?.contact_persons || details.contactPersons || [];
  return {
    ...blankForm,
    ...details,
    ...lead,
    name: lead?.name || details.name || "",
    phone: lead?.phone || lead?.mobile || details.phone || "",
    contactType: lead?.contact_type || details.contactType || blankForm.contactType,
    entityType: lead?.entity_type || details.entityType || blankForm.entityType,
    contactId: details.contactId || lead?.contact_id || "",
    prefix: details.prefix || "",
    firstName: details.firstName || "",
    middleName: details.middleName || "",
    lastName: details.lastName || "",
    businessName: details.businessName || (lead?.entity_type === "Business" ? lead?.name : "") || "",
    altPhone: details.altPhone || "",
    landline: details.landline || "",
    dob: details.dob || "",
    lifeStage: details.lifeStage || lead?.contact_type || "Lead",
    taxNumber: lead?.tax_number || details.taxNumber || "",
    zipCode: lead?.zip_code || details.zipCode || "",
    streetName: lead?.street_name || details.streetName || "",
    buildingNumber: lead?.building_number || details.buildingNumber || "",
    additionalNumber: lead?.additional_number || details.additionalNumber || "",
    productCategory: lead?.product_category || details.productCategory || "Packaging Machine",
    machineType: lead?.machine_type || details.machineType || "Strapping Machine",
    application: lead?.application || details.application || "",
    requirementQuantity: lead?.requirement_quantity ?? details.requirementQuantity ?? 1,
    installationLocation: lead?.installation_location || details.installationLocation || lead?.location || "",
    requirementDetails: lead?.requirement_details || details.requirementDetails || "",
    budget: lead?.budget ?? details.budget ?? "",
    expectedPurchaseDate: String(lead?.expected_purchase_date || details.expectedPurchaseDate || "").slice(0, 10),
    quotationValue: lead?.quotation_value ?? details.quotationValue ?? lead?.value ?? "",
    competitorDetails: lead?.competitor_details || details.competitorDetails || "",
    nextFollowupDate: toDateTimeLocalValue(lead?.next_followup_date || details.nextFollowupDate || ""),
    nextFollowupActivity: lead?.next_followup_activity || details.nextFollowupActivity || "",
    gpsLatitude: lead?.gps_latitude ?? details.gpsLatitude ?? "",
    gpsLongitude: lead?.gps_longitude ?? details.gpsLongitude ?? "",
    gpsAccuracy: lead?.gps_accuracy ?? details.gpsAccuracy ?? "",
    gpsCapturedAt: lead?.gps_captured_at || details.gpsCapturedAt || "",
    customFields,
    contactPersons: Array.isArray(contactPersons) ? contactPersons : [],
  };
};
const getStageColor = (s) => {
  const map = {
    New: "#f3f4f6", Contacted: "#dbeafe", Qualified: "#ede9fe", 
    Proposal: "#fef3c7", Negotiation: "#fed7aa", Won: "#dcfce7", Lost: "#fee2e2"
  };
  return map[s] || "#f3f4f6";
};

const getStageTextColor = (s) => {
  const map = {
    New: "#374151", Contacted: "#1d4ed8", Qualified: "#6d28d9",
    Proposal: "#b45309", Negotiation: "#c2410c", Won: "#15803d", Lost: "#b91c1c"
  };
  return map[s] || "#374151";
};

function exportCSV(rows, filename = "export.csv") {
  if (!rows?.length) { alert("Nothing to export."); return; }
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: filename,
  });
  a.click();
}

const buildServiceReportPdf = (machine, service) => {
  const doc = new jsPDF();
  doc.setFontSize(18); doc.setTextColor(26, 92, 56); doc.text("MACHINE SERVICE REPORT", 14, 18);
  doc.setFontSize(10); doc.setTextColor(90); doc.text("Manod CRM — After-Sales & Service", 14, 25);
  autoTable(doc, {
    startY: 32,
    theme: "grid",
    head: [["Customer", "Machine", "Serial Number", "Service Date"]],
    body: [[machine?.customer_name || "-", machine?.machine_model || "-", machine?.serial_number || "-", service.serviceDate || "-"]],
    headStyles: { fillColor: [26, 92, 56] },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    theme: "grid",
    body: [
      ["Service Category", service.serviceCategory || "-", "Status", service.status || "-"],
      ["Technician", service.technician || "-", "Coverage", service.coverageStatus || "-"],
      ["Resolution", service.resolutionStatus || "-", "Next Service", service.nextServiceDate || "-"],
      ["Customer Contact", service.customerContactName || "-", "Contact Phone", service.customerContactPhone || "-"],
      ["Downtime Start", service.downtimeStart || "-", "Downtime End", service.downtimeEnd || "-"],
      ["Labour Cost", formatCurrency(service.laborCost || 0), "Spare Cost", formatCurrency(service.spareCost || 0)],
      ["Travel Cost", formatCurrency(service.travelCost || 0), "Total Cost", formatCurrency(Number(service.laborCost || 0) + Number(service.spareCost || 0) + Number(service.travelCost || 0))],
    ],
    styles: { fontSize: 9 }, columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    theme: "grid",
    head: [["Service Details", "Information"]],
    body: [["Issue Reported", service.issueReported || "-"], ["Work Performed", service.workPerformed || "-"], ["Spare Used", service.spareUsed || "-"], ["Notes", service.notes || "-"]],
    headStyles: { fillColor: [26, 92, 56] },
  });
  const signatureY = Math.min(270, doc.lastAutoTable.finalY + 24);
  doc.setTextColor(40); doc.text("Technician Signature: ____________________", 14, signatureY);
  doc.text(`Customer Confirmation: ${service.customerConfirmationName || "____________________"}`, 110, signatureY);
  doc.setFontSize(8); doc.setTextColor(110); doc.text("Automatically generated by Manod CRM when no service report was uploaded.", 14, 287);
  const safeModel = String(machine?.machine_model || "machine").replace(/[^a-z0-9_-]+/gi, "-");
  return { fileName: `service-report-${safeModel}-${service.serviceDate || "date"}.pdf`, mimeType: "application/pdf", base64Data: doc.output("datauristring").split(",")[1] };
};

const leadImportTemplateRows = [
  ["Lead Name", "Company", "Location", "Phone", "Email", "Source", "Stage", "Value", "Assigned", "Industry", "Product Category", "Machine Type", "Application", "Quantity", "Installation Location", "Requirement Details", "Budget", "Expected Purchase Date", "Quotation Value", "Competitor Details", "Next Follow-up", "Follow-up Activity", "Notes"],
  ["ABC Industries", "ABC Pvt Ltd", "Chennai", "9876543210", "abc@example.com", "Website", "New", "50000", "Er Sarath Raj", "Manufacturing", "Packaging Machine", "Strapping Machine", "Carton strapping", "2", "Chennai", "Automatic line integration", "500000", "2026-09-30", "475000", "Competitor model under review", "2026-08-06 10:00", "Site visit", "Imported lead"],
];

const normalizeImportKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeImportValue = (value) => cleanText(value, "").trim();

const getImportValue = (row, aliases) => {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeImportKey(key), value]));
  for (const alias of aliases) {
    const value = normalized[normalizeImportKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return normalizeImportValue(value);
  }
  return "";
};

const pickAllowedValue = (value, allowed, fallback) => {
  const text = normalizeImportValue(value);
  if (!text) return fallback;
  const match = allowed.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || fallback;
};

const parseLeadImportRows = (rows, defaultUser) => {
  const leads = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = getImportValue(row, ["Lead Name", "Name", "Customer", "Customer Name", "Client", "Client Name"]);
    const phone = getImportValue(row, ["Phone", "Mobile", "Mobile Number", "Contact", "Contact Number", "Phone Number"]);
    if (!name || !phone) {
      errors.push(`Row ${rowNumber}: Lead Name and Phone are required`);
      return;
    }

    leads.push({
      name,
      phone,
      mobile: phone,
      company: getImportValue(row, ["Company", "Company Name", "Organization", "Business"]),
      location: getImportValue(row, ["Location", "City", "Place", "Area"]),
      email: getImportValue(row, ["Email", "Email ID", "Mail", "Mail ID"]),
      source: pickAllowedValue(getImportValue(row, ["Source", "Lead Source"]), LEAD_SOURCES, "Website"),
      stage: pickAllowedValue(getImportValue(row, ["Stage", "Lead Stage", "Status"]), MANUAL_LEAD_STAGES, "New"),
      value: parseCurrencyValue(getImportValue(row, ["Value", "Lead Value", "Lead Value (INR)", "Lead Value INR", "Value INR", "Amount", "Deal Value", "Estimated Value", "Quotation Value", "Budget"])),
      assigned: getImportValue(row, ["Assigned", "Assigned To", "Salesperson", "Owner"]) || defaultUser,
      industry: getImportValue(row, ["Industry", "Segment"]),
      productCategory: getImportValue(row, ["Product Category", "Category"]) || "Packaging Machine",
      machineType: getImportValue(row, ["Machine Type", "Equipment Type"]) || "Strapping Machine",
      application: getImportValue(row, ["Application", "Packaging Application"]),
      requirementQuantity: Number(getImportValue(row, ["Quantity", "Required Units"])) || 1,
      installationLocation: getImportValue(row, ["Installation Location", "Machine Location", "Location"]),
      requirementDetails: getImportValue(row, ["Requirement Details", "Technical Specifications", "Specifications"]),
      budget: parseCurrencyValue(getImportValue(row, ["Budget", "Expected Investment"])),
      expectedPurchaseDate: getImportValue(row, ["Expected Purchase Date", "Purchase Date", "Customer Timeline"]),
      quotationValue: parseCurrencyValue(getImportValue(row, ["Quotation Value", "Proposed Value"])),
      competitorDetails: getImportValue(row, ["Competitor Details", "Competitor"]),
      nextFollowupDate: getImportValue(row, ["Next Follow-up", "Next Follow-up Date"]),
      nextFollowupActivity: getImportValue(row, ["Follow-up Activity", "Next Activity"]),
      notes: getImportValue(row, ["Notes", "Remarks", "Description"]),
      contact: getImportValue(row, ["Contact Person", "Contact Name"]),
      converted: false,
    });
  });
  return { leads, errors };
};

// ---------------------------------------------------------------------------
// REUSABLE UI COMPONENTS
// ---------------------------------------------------------------------------
const KPICard = ({ icon: Icon, label, value, color, trend, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20,
      display: "flex", gap: 16, alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      cursor: onClick ? "pointer" : "default", transition: "transform 0.12s ease, box-shadow 0.12s ease",
    }}
    onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)"; } }}
    onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; } }}
  >
    <div style={{ width: 56, height: 56, borderRadius: 12, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={28} color={color} strokeWidth={1.5} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#1f2937", lineHeight: 1.1, wordBreak: "break-word" }}>{value}</div>
      {trend && <div style={{ fontSize: 11, color: COLORS.success, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}><TrendingUp size={14} />{trend}</div>}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    Sent: { bg: "#dcfce7", color: "#15803d" }, Viewed: { bg: "#ccfbf1", color: "#0f766e" },
    Accepted: { bg: "#dbeafe", color: "#1d4ed8" }, Rejected: { bg: "#fee2e2", color: "#b91c1c" },
    Scheduled: { bg: "#fef3c7", color: "#b45309" }, Completed: { bg: "#dcfce7", color: "#15803d" },
    Open: { bg: "#dbeafe", color: "#1d4ed8" }, Cancelled: { bg: "#fee2e2", color: "#b91c1c" },
    Draft: { bg: "#f3f4f6", color: "#374151" }, Active: { bg: "#dcfce7", color: "#15803d" },
    Inactive: { bg: "#f3f4f6", color: "#374151" }, Customer: { bg: "#dcfce7", color: "#15803d" },
    Call: { bg: "#ede9fe", color: "#6d28d9" }, Email: { bg: "#dbeafe", color: "#1d4ed8" },
    Meeting: { bg: "#fef3c7", color: "#b45309" }, Demo: { bg: "#ede9fe", color: "#6d28d9" },
    "Site Visit": { bg: "#fed7aa", color: "#c2410c" }, Pending: { bg: "#fef3c7", color: "#b45309" },
    Won: { bg: "#dcfce7", color: "#15803d" }, Lost: { bg: "#fee2e2", color: "#b91c1c" },
  };
  const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 8, background: s.bg, color: s.color, fontSize: 12, fontWeight: 600 }}>{status}</span>;
};

const Avatar = ({ name, size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: COLORS.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 40 ? 16 : 12, fontWeight: 600, flexShrink: 0 }}>
    {getInitials(name)}
  </div>
);

const Button = ({ children, variant = "primary", size = "md", onClick, icon: Icon, disabled }) => {
  const base = { padding: size === "sm" ? "6px 12px" : "10px 16px", fontSize: size === "sm" ? 12 : 13, fontWeight: 600, border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s", opacity: disabled ? 0.6 : 1 };
  const vars = { primary: { background: COLORS.primary, color: "white" }, secondary: { background: COLORS.bg, color: "#1f2937", border: `1px solid ${COLORS.border}` }, danger: { background: COLORS.danger, color: "white" } };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...vars[variant] }}>{Icon && <Icon size={16} />}{children}</button>;
};

const Modal = ({ title, open, onClose, children, maxWidth = 700, preventClose = false }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, overflowY: "auto", paddingY: 20 }} onClick={() => { if (!preventClose) onClose?.(); }}>
      <div style={{ background: COLORS.bgCard, borderRadius: 12, width: "90%", maxWidth, maxHeight: "90vh", overflow: "auto", padding: 28, boxShadow: "0 20px 25px rgba(0,0,0,0.15)", marginY: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={() => { if (!preventClose) onClose?.(); }} disabled={preventClose} style={{ background: "none", border: "none", fontSize: 24, cursor: preventClose ? "not-allowed" : "pointer", color: COLORS.neutral, opacity: preventClose ? 0.4 : 1 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
const labelStyle = { fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 };

const Th = ({ children }) => (
  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: COLORS.neutral, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, whiteSpace: "nowrap" }}>{children}</th>
);
const Td = ({ children, style: s }) => (
  <td style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, ...s }}>{children}</td>
);
const NoData = ({ cols, message = "No records found" }) => (
  <tr><td colSpan={cols} style={{ padding: 40, textAlign: "center", color: COLORS.neutral }}>{message}</td></tr>
);

const TableCard = ({ title, count, children, onExport, searchVal, onSearch }) => (
  <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}{count !== undefined && ` (${count})`}</h3>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {onSearch && (
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search..." value={searchVal} onChange={e => onSearch(e.target.value)} style={{ ...inputStyle, width: 200, paddingLeft: 32 }} />
          </div>
        )}
        {onExport && <Button variant="secondary" size="sm" icon={Download} onClick={onExport}>Export</Button>}
      </div>
    </div>
    <div style={{ overflowX: "auto" }}>{children}</div>
  </div>
);

const FilterBar = ({ children }) => (
  <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
    {children}
  </div>
);
const FilterGroup = ({ label, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.neutral, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
    {children}
  </div>
);

const DateTimeFields = ({ label, value, onChange, required = false }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
      <input
        type="date"
        required={required}
        value={dateInputValue(value)}
        onChange={(e) => onChange(updateDateTimePart(value, "date", e.target.value))}
        style={inputStyle}
      />
      <input
        type="time"
        required={required}
        value={timeInputValue(value)}
        onChange={(e) => onChange(updateDateTimePart(value, "time", e.target.value))}
        style={inputStyle}
      />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// ENHANCED LEAD FORM SECTION
// ---------------------------------------------------------------------------
const FormField = ({ label, children, help }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    {children}
    {help && <div style={{ fontSize: 11, color: COLORS.neutral, marginTop: 6 }}>{help}</div>}
  </div>
);

const LeadFormSection = ({ formData, setFormData, title = "Lead Information", userOptions = DEFAULT_USER_OPTIONS }) => {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const update = (key, value) => setFormData({ ...formData, [key]: value });
  const isBusiness = formData.entityType === "Business";
  const fieldGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 16 };
  const captureLiveLocation = async () => {
    setLocating(true);setLocationError('');
    try {const gps=await captureLocation();setFormData(current=>({...current,...gps}));}
    catch(error){setLocationError(error.message);}
    finally{setLocating(false);}
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${COLORS.border}` }}>
        {title}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1fr) minmax(220px, 1fr)", gap: 16, marginBottom: 18, alignItems: "start" }}>
        <FormField label="Contact type:*">
          <select value={formData.contactType || "Lead"} onChange={e => update("contactType", e.target.value)} style={inputStyle}>
            {LIFE_STAGES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormField>
        <div style={{ paddingTop: 26, display: "flex", gap: 20, alignItems: "center" }}>
          {["Individual", "Business"].map(t => (
            <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="radio" name="entityType" checked={formData.entityType === t} onChange={() => update("entityType", t)} />
              {t}
            </label>
          ))}
        </div>
        <FormField label="Contact ID:" help="Leave empty to autogenerate">
          <input value={formData.contactId || ""} onChange={e => update("contactId", e.target.value)} style={inputStyle} placeholder="Contact ID" />
        </FormField>
      </div>

      {isBusiness ? (
        <div style={fieldGrid}>
          <FormField label="Business Name:*"><input value={formData.businessName || formData.name || ""} onChange={e => update("businessName", e.target.value)} style={inputStyle} placeholder="Business Name" /></FormField>
          <FormField label="Industry"><input value={formData.industry || ""} onChange={e => update("industry", e.target.value)} style={inputStyle} placeholder="Industry" /></FormField>
          <FormField label="Company"><input value={formData.company || ""} onChange={e => update("company", e.target.value)} style={inputStyle} placeholder="Company" /></FormField>
        </div>
      ) : (
        <div style={{ ...fieldGrid, gridTemplateColumns: "120px repeat(3, minmax(170px, 1fr))" }}>
          <FormField label="Prefix:"><input value={formData.prefix || ""} onChange={e => update("prefix", e.target.value)} style={inputStyle} placeholder="Mr / Mrs / Miss" /></FormField>
          <FormField label="First Name:*"><input value={formData.firstName || ""} onChange={e => update("firstName", e.target.value)} style={inputStyle} placeholder="First Name" /></FormField>
          <FormField label="Middle name:"><input value={formData.middleName || ""} onChange={e => update("middleName", e.target.value)} style={inputStyle} placeholder="Middle name" /></FormField>
          <FormField label="Last Name:"><input value={formData.lastName || ""} onChange={e => update("lastName", e.target.value)} style={inputStyle} placeholder="Last Name" /></FormField>
        </div>
      )}

      <div style={fieldGrid}>
        <FormField label="Mobile:*"><input type="tel" value={formData.phone || ""} onChange={e => update("phone", e.target.value)} style={inputStyle} placeholder="Mobile" /></FormField>
        <FormField label="Alternate contact number:"><input value={formData.altPhone || ""} onChange={e => update("altPhone", e.target.value)} style={inputStyle} placeholder="Alternate contact number" /></FormField>
        <FormField label="Landline:"><input value={formData.landline || ""} onChange={e => update("landline", e.target.value)} style={inputStyle} placeholder="Landline" /></FormField>
        <FormField label="Email:"><input type="email" value={formData.email || ""} onChange={e => update("email", e.target.value)} style={inputStyle} placeholder="Email" /></FormField>
      </div>

      <div style={fieldGrid}>
        {!isBusiness && <FormField label="Date of birth:"><input type="date" value={formData.dob || ""} onChange={e => update("dob", e.target.value)} style={inputStyle} /></FormField>}
        <FormField label="Source:">
          <select value={formData.source || "Website"} onChange={e => update("source", e.target.value)} style={inputStyle}>
            <option value="">Please Select</option>{LEAD_SOURCES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormField>
        <FormField label="Life Stage:">
          <select value={formData.lifeStage || "Lead"} onChange={e => update("lifeStage", e.target.value)} style={inputStyle}>
            <option value="">Please Select</option>{LIFE_STAGES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FormField>
        <FormField label="Assigned to:*">
          <select value={formData.assigned || firstUserValue(userOptions)} onChange={e => update("assigned", e.target.value)} style={inputStyle}>
            {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
      </div>

      <div style={fieldGrid}>
        <FormField label="Lead Stage:">
          <select value={formData.stage || "New"} onChange={e => update("stage", e.target.value)} style={inputStyle}>
            {(formData.stage === "Won" ? LEAD_STAGES : MANUAL_LEAD_STAGES).map(o => <option key={o}>{o}</option>)}
          </select>
        </FormField>
        <FormField label="Lead Value (INR):"><input type="number" value={formData.value || ""} onChange={e => update("value", e.target.value)} style={inputStyle} placeholder="0" /></FormField>
        <FormField label="Location"><input value={formData.location || ""} onChange={e => update("location", e.target.value)} style={inputStyle} placeholder="Location" /></FormField>
      </div>
      <div style={{ padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.bg, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Lead added from live location</div>
          {locationError && <p role="alert" style={{color: "#b91c1c", fontSize: 13, maxWidth: 560}}>{locationError}</p>}
          <div style={{ fontSize: 12, color: COLORS.neutral, marginTop: 4 }}>
            {formData.gpsLatitude !== "" && formData.gpsLongitude !== ""
              ? `${formData.gpsLatitude}, ${formData.gpsLongitude} (accuracy about ${formData.gpsAccuracy || "-"} m)`
              : "No GPS location captured yet."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {formData.gpsLatitude !== "" && formData.gpsLongitude !== "" && <Button type="button" size="sm" variant="secondary" onClick={() => window.open(`https://www.google.com/maps?q=${formData.gpsLatitude},${formData.gpsLongitude}`, "_blank", "noopener,noreferrer")}>View Map</Button>}
          <Button type="button" size="sm" icon={MapPin} onClick={captureLiveLocation} disabled={locating}>{locating ? "Capturing..." : (formData.gpsLatitude !== "" ? "Update Location" : "Capture Live Location")}</Button>
        </div>
      </div>
    </div>
  );
};

const AdditionalInfoSection = ({ formData, setFormData }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${COLORS.border}` }}>
      Additional Information
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1fr)", gap: 16, marginBottom: 16 }}>
      <FormField label="Contact Person"><input value={formData.contact || ""} onChange={e => setFormData({ ...formData, contact: e.target.value })} style={inputStyle} placeholder="Contact person" /></FormField>
      <FormField label="Status">
        <select value={formData.converted ? "Customer" : "Active"} onChange={e => setFormData({ ...formData, converted: e.target.value === "Customer" })} style={inputStyle}>
          <option>Active</option>
          <option>Customer</option>
        </select>
      </FormField>
    </div>
    <FormField label="Notes">
      <textarea value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} placeholder="Add notes about this lead..." />
    </FormField>
  </div>
);
// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------
const CRMNav = ({ activeTab, onTabChange, counts = {}, canViewMachines = true, allowedTabs = null, crmIndustry = 'general' }) => {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "leads", label: "Leads", icon: Users, count: counts.leads },
    { id: "followups", label: "Follow Ups", icon: MessageSquare, count: counts.followups },
    { id: "proposals", label: "Proposals", icon: FileText, count: counts.proposals },
    { id: "export", label: "Export Workspace", icon: Globe },
    { id: "real-estate", label: "Real Estate", icon: MapPin },
    { id: "payment-reminders", label: "Payments", icon: DollarSign, count: counts.paymentReminders },
    { id: "customer-success", label: "Customer Success", icon: CheckCircle2, count: counts.customerSuccess },
    { id: "machines", label: "Machines & Service", icon: Settings, count: counts.machines },
    { id: "contacts", label: "Contacts", icon: UserCheck },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "sources", label: "Sources", icon: Globe },
    { id: "reports", label: "Reports", icon: PieChart },
    { id: "settings", label: "Settings", icon: Settings },
  ].filter(tab => (tab.id !== "machines" || (canViewMachines && crmIndustry === 'machine')) && (tab.id !== 'export' || crmIndustry === 'export') && (tab.id !== 'real-estate' || crmIndustry === 'real_estate') && (!allowedTabs || allowedTabs.includes(tab.id)));
  return (
    <div style={{ background: COLORS.bgCard, borderBottom: `1px solid ${COLORS.border}`, display: "flex", overflowX: "auto" }}>
      {tabs.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{ padding: "14px 18px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: active ? 600 : 500, color: active ? COLORS.primary : COLORS.neutral, borderBottom: active ? `3px solid ${COLORS.primary}` : "3px solid transparent", whiteSpace: "nowrap" }}>
            <Icon size={15} strokeWidth={1.5} />{tab.label}
            {tab.count > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: COLORS.primary, color: "#fff", fontSize: 10, fontWeight: 700, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
const DashboardChartCard = ({ title, children, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: COLORS.bgCard,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 10,
      overflow: "hidden",
      minHeight: 300,
      cursor: onClick ? "pointer" : "default",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}
  >
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
      {onClick && <span style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700 }}>Open</span>}
    </div>
    <div style={{ padding: 18, height: 244 }}>
      {children}
    </div>
  </div>
);

const PageHeader = ({ title, subtitle, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
    <div><h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>{subtitle && <p style={{ margin: "5px 0 0", color: COLORS.neutral, fontSize: 13 }}>{subtitle}</p>}</div>
    {action}
  </div>
);

const MachineRequirementSection = ({ formData, setFormData, userOptions = DEFAULT_USER_OPTIONS }) => {
  const update = (key, value) => setFormData({ ...formData, [key]: value });
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 };
  return (
    <div style={{ marginBottom: 24, padding: 18, border: `1px solid ${COLORS.border}`, borderRadius: 10, background: "#fbfdfb" }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: COLORS.primary }}>Product Discussion</div>
      <div style={grid}>
        <FormField label="Product Category"><input aria-label="Product Category" value={formData.productCategory || ""} onChange={e => update("productCategory", e.target.value)} style={inputStyle} placeholder="Cutting tools / Tool holders" /></FormField>
        <FormField label="Application"><input value={formData.application || ""} onChange={e => update("application", e.target.value)} style={inputStyle} placeholder="Customer product application" /></FormField>
        <FormField label="Quantity"><input type="number" min="1" value={formData.requirementQuantity || ""} onChange={e => update("requirementQuantity", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Industry"><input value={formData.industry || ""} onChange={e => update("industry", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Budget (INR)"><input type="number" value={formData.budget || ""} onChange={e => update("budget", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Expected Purchase Date"><input type="date" value={formData.expectedPurchaseDate || ""} onChange={e => update("expectedPurchaseDate", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Quotation Value (INR)"><input type="number" value={formData.quotationValue || ""} onChange={e => update("quotationValue", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Salesperson"><select value={formData.assigned || firstUserValue(userOptions)} onChange={e => setFormData({ ...formData, assigned: e.target.value, assignedUserId: userIdForValue(userOptions, e.target.value) })} style={inputStyle}>{userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FormField>
        <FormField label="Next Follow-up"><input type="datetime-local" value={formData.nextFollowupDate || ""} onChange={e => update("nextFollowupDate", e.target.value)} style={inputStyle} /></FormField>
        <FormField label="Follow-up Activity"><input value={formData.nextFollowupActivity || ""} onChange={e => update("nextFollowupActivity", e.target.value)} style={inputStyle} placeholder="Call / demo / visit" /></FormField>
      </div>
      <div style={grid}>
        <FormField label="Requirement Details"><textarea rows={3} value={formData.requirementDetails || ""} onChange={e => update("requirementDetails", e.target.value)} style={{ ...inputStyle, resize: "vertical" }} /></FormField>
        <FormField label="Competitor Details"><textarea rows={3} value={formData.competitorDetails || ""} onChange={e => update("competitorDetails", e.target.value)} style={{ ...inputStyle, resize: "vertical" }} /></FormField>
      </div>
    </div>
  );
};

const SimpleCRMAssistant = ({ leads = [], proposals = [], followups = [], paymentReminders = [], customerSuccess = [], navigate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      title: "CRM Assistant",
      body: "Ask me about follow-ups, missed tasks, proposal leads, payments, customer success, duplicate leads, hot leads, stage summary, revenue, workload, or message drafts.",
    },
  ]);

  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const duplicateGroups = useMemo(() => {
    const groups = new Map();
    const addKey = (key, lead) => {
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      const current = groups.get(key);
      if (!current.some(item => item.id === lead.id)) current.push(lead);
    };

    leads.forEach(lead => {
      const phone = String(lead.phone || lead.mobile || "").replace(/\D/g, "");
      const email = String(lead.email || "").trim().toLowerCase();
      const name = String(lead.name || lead.lead_name || "").trim().toLowerCase();
      const company = String(lead.company || "").trim().toLowerCase();
      if (phone.length >= 6) addKey(`phone:${phone}`, lead);
      if (email.includes("@")) addKey(`email:${email}`, lead);
      if (name && company) addKey(`name-company:${name}|${company}`, lead);
    });

    return Array.from(groups.values()).filter(group => group.length > 1);
  }, [leads]);

  const stats = useMemo(() => {
    const scheduledFollowups = followups.filter(item => cleanText(item.status || "", "") === "Scheduled");
    const todayFollowups = scheduledFollowups.filter(item => isTodayDate(item.start || item.start_time));
    const overdueFollowups = scheduledFollowups.filter(item => {
      const date = parseDateTimeValue(item.start || item.start_time);
      return date && date < todayStart;
    });
    const proposalLeads = leads.filter(lead => cleanText(lead.stage || "", "") === "Proposal" && !lead.converted);
    const openProposals = proposals.filter(item => ["Draft", "Sent", "Viewed"].includes(cleanText(item.status || "", "")));
    const pendingPayments = paymentReminders.filter(item => cleanText(item.status || "", "") !== "Completed" && cleanText(item.current_stage || "", "") !== "Payment Received");
    const overduePayments = pendingPayments.filter(item => {
      const date = parseDateTimeValue(item.due_date || item.dueDate);
      return date && date < todayStart;
    });
    const receivedPayments = paymentReminders.filter(item => cleanText(item.status || "", "") === "Completed" || cleanText(item.current_stage || "", "") === "Payment Received");
    const activeCustomerSuccess = customerSuccess.filter(item => cleanText(item.status || "", "") !== "Completed");
    const stageCounts = LEAD_STAGES.map(stage => ({
      stage,
      count: leads.filter(lead => cleanText(lead.stage || "", "") === stage).length,
      value: leads.filter(lead => cleanText(lead.stage || "", "") === stage).reduce((sum, lead) => sum + Number(lead.value || 0), 0),
    }));
    const assigneeCounts = Object.values(leads.reduce((acc, lead) => {
      const key = lead.assignedTo || lead.assigned_to || lead.assigned || "Unassigned";
      if (!acc[key]) acc[key] = { name: key, leads: 0, followups: 0, value: 0 };
      acc[key].leads += 1;
      acc[key].value += Number(lead.value || 0);
      return acc;
    }, {}));
    followups.forEach(item => {
      const key = item.assignedTo || item.assigned_to || item.assigned || "Unassigned";
      const existing = assigneeCounts.find(row => row.name === key);
      if (existing) existing.followups += 1;
      else assigneeCounts.push({ name: key, leads: 0, followups: 1, value: 0 });
    });
    const highValueLeads = [...leads]
      .filter(lead => !lead.converted && Number(lead.value || 0) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 5);
    const pipelineValue = leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0);
    const acceptedValue = proposals
      .filter(item => cleanText(item.status || "", "") === "Accepted")
      .reduce((sum, item) => sum + Number(item.value || item.amount || 0), 0);
    const nextActionItems = [
      ...overdueFollowups.map(item => ({ label: item.lead, detail: item.title || "Missed follow-up", path: "/crm/follow-ups" })),
      ...pendingPayments.map(item => ({ label: item.customer || item.lead, detail: item.current_stage || "Payment pending", path: "/crm/payment-reminders" })),
      ...proposalLeads.map(item => ({ label: item.name, detail: "Send proposal quotation", path: "/crm/proposals" })),
    ].slice(0, 6);

    return {
      todayFollowups,
      overdueFollowups,
      proposalLeads,
      openProposals,
      pendingPayments,
      overduePayments,
      receivedPayments,
      activeCustomerSuccess,
      duplicateGroups,
      stageCounts,
      assigneeCounts,
      highValueLeads,
      pipelineValue,
      acceptedValue,
      nextActionItems,
    };
  }, [leads, proposals, followups, paymentReminders, customerSuccess, duplicateGroups, todayStart]);

  const listItems = (items, formatter, emptyText) => {
    if (!items.length) return emptyText;
    return items.slice(0, 5).map(formatter).join("\n");
  };

  const buildAnswer = (input) => {
    const text = input.toLowerCase();

    if (text.includes("miss") || text.includes("overdue") || text.includes("absent")) {
      return {
        title: "Missed Follow-ups",
        body: `${stats.overdueFollowups.length} overdue follow-up${stats.overdueFollowups.length === 1 ? "" : "s"} found.\n\n${listItems(stats.overdueFollowups, item => `- ${item.lead}: ${item.title || "Follow-up"} (${formatDate(item.start || item.start_time)})`, "No missed follow-ups right now.")}`,
        actionLabel: "Open Follow-ups",
        actionPath: "/crm/follow-ups",
      };
    }

    if (text.includes("today") || text.includes("schedule") || text.includes("follow")) {
      return {
        title: "Today Follow-ups",
        body: `${stats.todayFollowups.length} follow-up${stats.todayFollowups.length === 1 ? "" : "s"} scheduled for today.\n\n${listItems(stats.todayFollowups, item => `- ${item.lead}: ${item.title || "Follow-up"} (${formatDate(item.start || item.start_time)})`, "No follow-ups are scheduled for today.")}`,
        actionLabel: "Open Follow-ups",
        actionPath: "/crm/follow-ups",
      };
    }

    if (text.includes("proposal") || text.includes("quotation")) {
      return {
        title: "Proposal Work",
        body: `${stats.proposalLeads.length} lead${stats.proposalLeads.length === 1 ? "" : "s"} are in Proposal stage and ${stats.openProposals.length} proposal${stats.openProposals.length === 1 ? "" : "s"} are still open.\n\n${listItems(stats.proposalLeads, lead => `- ${lead.name}: ${formatCurrency(Number(lead.value || 0))}`, "No leads are waiting in Proposal stage.")}`,
        actionLabel: "Open Proposals",
        actionPath: "/crm/proposals",
      };
    }

    if (text.includes("hot") || text.includes("high value") || text.includes("important lead")) {
      return {
        title: "Hot Leads",
        body: `${stats.highValueLeads.length} high-value lead${stats.highValueLeads.length === 1 ? "" : "s"} found.\n\n${listItems(stats.highValueLeads, lead => `- ${lead.name}: ${formatCurrency(Number(lead.value || 0))} (${lead.stage || "No stage"})`, "No high-value leads found yet.")}`,
        actionLabel: "Open Leads",
        actionPath: "/crm/leads",
      };
    }

    if (text.includes("stage") || text.includes("pipeline")) {
      return {
        title: "Lead Stage Summary",
        body: listItems(stats.stageCounts, item => `- ${item.stage}: ${item.count} lead${item.count === 1 ? "" : "s"} / ${formatCurrency(item.value)}`, "No stage data available."),
        actionLabel: "Open Leads",
        actionPath: "/crm/leads",
      };
    }

    if (text.includes("revenue") || text.includes("value") || text.includes("sales amount")) {
      return {
        title: "Revenue Summary",
        body: `Pipeline value: ${formatCurrency(stats.pipelineValue)}\nAccepted proposal value: ${formatCurrency(stats.acceptedValue)}\nPending payments: ${stats.pendingPayments.length}\nOverdue payments: ${stats.overduePayments.length}`,
        actionLabel: "Open Reports",
        actionPath: "/crm/reports",
      };
    }

    if (text.includes("workload") || text.includes("assigned") || text.includes("team")) {
      const sorted = [...stats.assigneeCounts].sort((a, b) => (b.leads + b.followups) - (a.leads + a.followups));
      return {
        title: "Assigned Workload",
        body: listItems(sorted, item => `- ${item.name}: ${item.leads} leads, ${item.followups} follow-ups, ${formatCurrency(item.value)}`, "No assigned workload found."),
        actionLabel: "Open Leads",
        actionPath: "/crm/leads",
      };
    }

    if (text.includes("next action") || text.includes("what next") || text.includes("priority")) {
      return {
        title: "Next Best Actions",
        body: listItems(stats.nextActionItems, item => `- ${item.label}: ${item.detail}`, "No urgent next actions found."),
        actionLabel: "Open Dashboard",
        actionPath: "/crm",
      };
    }
    if (text.includes("payment") || text.includes("advance") || text.includes("reminder")) {
      return {
        title: "Payment Reminders",
        body: `${stats.pendingPayments.length} pending payment reminder${stats.pendingPayments.length === 1 ? "" : "s"} and ${stats.receivedPayments.length} received payment${stats.receivedPayments.length === 1 ? "" : "s"}.\n\n${listItems(stats.pendingPayments, item => `- ${item.customer || item.lead}: ${item.current_stage || "Payment reminder"} (${formatCurrency(Number(item.amount || 0))})`, "No pending payment reminders.")}`,
        actionLabel: "Open Payments",
        actionPath: "/crm/payment-reminders",
      };
    }

    if (text.includes("customer") || text.includes("success") || text.includes("implementation") || text.includes("support")) {
      return {
        title: "Customer Success",
        body: `${stats.activeCustomerSuccess.length} active customer success journey${stats.activeCustomerSuccess.length === 1 ? "" : "s"}.\n\n${listItems(stats.activeCustomerSuccess, item => `- ${item.customer}: ${item.current_stage || "Order Confirmed"} (Due ${formatDate(item.due_date || item.dueDate)})`, "No active customer success journeys right now.")}`,
        actionLabel: "Open Customer Success",
        actionPath: "/crm/customer-success",
      };
    }

    if (text.includes("duplicate") || text.includes("same lead")) {
      return {
        title: "Duplicate Leads",
        body: `${stats.duplicateGroups.length} duplicate group${stats.duplicateGroups.length === 1 ? "" : "s"} found.\n\n${listItems(stats.duplicateGroups, group => `- ${group.map(lead => lead.name).join(", ")}`, "No duplicate lead groups found.")}`,
        actionLabel: "Open Leads",
        actionPath: "/crm/leads",
      };
    }

    if (text.includes("draft") || text.includes("message") || text.includes("email") || text.includes("whatsapp")) {
      const lead = stats.overdueFollowups[0] || stats.todayFollowups[0] || leads[0] || {};
      const name = lead.lead || lead.name || "Customer";
      return {
        title: "Follow-up Message Draft",
        body: `Dear ${name},\n\nThis is a gentle follow-up from Manod Technologies regarding your requirement. Please let us know a convenient time to connect.\n\nRegards,\nManod Team`,
        actionLabel: "Open Follow-ups",
        actionPath: "/crm/follow-ups",
      };
    }

    return {
      title: "CRM Summary",
      body: `Here is the current CRM picture:\n\n- ${leads.length} leads\n- ${stats.proposalLeads.length} proposal-stage leads\n- ${stats.todayFollowups.length} follow-ups today\n- ${stats.overdueFollowups.length} missed follow-ups\n- ${stats.pendingPayments.length} pending payments\n- ${stats.overduePayments.length} overdue payments\n- ${stats.activeCustomerSuccess.length} customer success journeys\n- Pipeline value ${formatCurrency(stats.pipelineValue)}`,
      actionLabel: "Open Dashboard",
      actionPath: "/crm",
    };
  };

  const handleAsk = (value) => {
    const text = String(value || query || "").trim();
    if (!text) return;
    const answer = buildAnswer(text);
    setMessages(prev => [...prev, { role: "user", body: text }, { role: "assistant", ...answer }]);
    setQuery("");
  };

  const quickPrompts = [
    "Today follow-ups",
    "Missed follow-ups",
    "Next action",
    "Hot leads",
    "Stage summary",
    "Revenue summary",
    "Team workload",
    "Proposal leads",
    "Payments pending",
    "Customer success",
    "Duplicate leads",
    "Draft follow-up message",
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ position: "fixed", right: 22, bottom: 22, zIndex: 1400, border: "none", borderRadius: 999, background: COLORS.primary, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 10px 24px rgba(0,0,0,0.18)", cursor: "pointer", fontWeight: 700 }}
      >
        <MessageSquare size={18} /> CRM Assistant
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", right: 22, bottom: 22, width: 390, maxWidth: "calc(100vw - 32px)", height: 560, maxHeight: "calc(100vh - 44px)", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: "0 18px 48px rgba(0,0,0,0.22)", zIndex: 1400, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", background: COLORS.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Simple CRM Assistant</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Workflow helper, no data changes</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer" }}><X size={16} /></button>
      </div>

      <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {quickPrompts.map(prompt => (
          <button key={prompt} type="button" onClick={() => handleAsk(prompt)} style={{ border: `1px solid ${COLORS.border}`, background: COLORS.bg, borderRadius: 999, padding: "6px 9px", fontSize: 11, cursor: "pointer", color: COLORS.primary, fontWeight: 700 }}>{prompt}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", border: `1px solid ${message.role === "user" ? "#bbf7d0" : COLORS.border}`, background: message.role === "user" ? "#dcfce7" : COLORS.bgCard, borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            {message.title && <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.primary, marginBottom: 5 }}>{message.title}</div>}
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "#111827", whiteSpace: "pre-line" }}>{message.body}</div>
            {message.actionPath && (
              <button type="button" onClick={() => { navigate(message.actionPath); setOpen(false); }} style={{ marginTop: 9, border: "none", background: COLORS.primary, color: "#fff", borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{message.actionLabel || "Open"}</button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); handleAsk(); }} style={{ padding: 12, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 8 }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about CRM work..." style={{ flex: 1, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13 }} />
        <button type="submit" style={{ border: "none", borderRadius: 8, background: COLORS.primary, color: "#fff", padding: "0 13px", fontWeight: 800, cursor: "pointer" }}>Ask</button>
      </form>
    </div>
  );
};

const CRMDashboard = ({ leads, proposals, followups, paymentReminders = [], machines = [], consumables = [], replacements = [], canViewMachines = true, navigate, userOptions = DEFAULT_USER_OPTIONS }) => {
  const [dateFilter, setDateFilter] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getDashboardRecordDate = (record) => {
    const raw = record.start || record.start_time || record.payment_date || record.paid_at || record.created_at || record.createdAt || record.sent_at || record.sentAt || record.due_date || record.dueDate || record.next_follow_up || record.nextFollowUp || record.last_follow_up || record.lastFollowUp || record.updated_at || record.updatedAt;
    const parsed = parseDateTimeValue(raw);
    const fallback = raw ? new Date(raw) : null;
    const date = parsed || fallback;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };

  const dashboardRange = useMemo(() => {
    const now = new Date();
    const startOfDay = (date) => {
      const copy = new Date(date);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };
    const endOfDay = (date) => {
      const copy = new Date(date);
      copy.setHours(23, 59, 59, 999);
      return copy;
    };

    if (dateFilter === "custom") {
      const startDate = customStart ? startOfDay(new Date(customStart)) : null;
      const endDate = customEnd ? endOfDay(new Date(customEnd)) : null;
      return { start: startDate, end: endDate };
    }

    if (dateFilter === "week") {
      const start = startOfDay(now);
      start.setDate(now.getDate() - now.getDay());
      const end = endOfDay(start);
      end.setDate(start.getDate() + 6);
      return { start, end };
    }

    if (dateFilter === "month") {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    }

    if (dateFilter === "quarter") {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), quarterStartMonth, 1), end: endOfDay(new Date(now.getFullYear(), quarterStartMonth + 3, 0)) };
    }

    if (dateFilter === "year") {
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(new Date(now.getFullYear(), 11, 31)) };
    }

    return { start: startOfDay(now), end: endOfDay(now) };
  }, [dateFilter, customStart, customEnd]);

  const isInDashboardRange = (record) => {
    const date = getDashboardRecordDate(record);
    if (!date) return dateFilter !== "custom";
    if (dashboardRange.start && date < dashboardRange.start) return false;
    if (dashboardRange.end && date > dashboardRange.end) return false;
    return true;
  };

  const dateFilterLabel = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    quarter: "This Quarter",
    year: "This Year",
    custom: "Custom Date",
  }[dateFilter];

  const dashboardLeads = leads.filter(isInDashboardRange);
  const dashboardProposals = proposals.filter(isInDashboardRange);
  const dashboardFollowups = followups.filter(isInDashboardRange);
  const dashboardPaymentReminders = paymentReminders.filter(isInDashboardRange);

  const totalLeads = dashboardLeads.length;
  const activeLeads = dashboardLeads.filter(l => !l.converted).length;
  const totalProposalValue = dashboardProposals.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const acceptedValue = dashboardProposals.filter(p => p.status === "Accepted").reduce((s, p) => s + (Number(p.value) || 0), 0);
  const pendingFollowups = dashboardFollowups.filter(f => f.status === "Scheduled").length;
  const activeMachines = machines.filter(machine => cleanText(machine.status, "Active").toLowerCase() === "active");
  const serviceDueMachines = activeMachines.filter(machine => {
    const due = parseDateTimeValue(machine.next_maintenance);
    if (!due) return false;
    const limit = new Date(); limit.setHours(23, 59, 59, 999); limit.setDate(limit.getDate() + 7);
    return due <= limit;
  });
  const consumablesDue = consumables.filter(item => {
    if (cleanText(item.status, "Active").toLowerCase() !== "active") return false;
    const due = parseDateTimeValue(item.next_requirement_date);
    if (!due) return false;
    const limit = new Date(); limit.setHours(23, 59, 59, 999); limit.setDate(limit.getDate() + 7);
    return due <= limit;
  });
  const openReplacements = replacements.filter(item => cleanText(item.status, "Open").toLowerCase() === "open");
  const replacementPipelineValue = openReplacements.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const todayFollowups = followups.filter(f => f.status === "Scheduled" && isTodayDate(f.start || f.start_time));
  const scheduleFollowups = dashboardFollowups.filter(f => f.status === "Scheduled");
  const todaySchedule = scheduleFollowups
    .map((followup) => ({ ...followup, scheduleDate: parseDateTimeValue(followup.start || followup.start_time) }))
    .filter((followup) => followup.scheduleDate)
    .sort((a, b) => a.scheduleDate - b.scheduleDate);
  const formatScheduleTime = (date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: date.getMinutes() ? "2-digit" : undefined });
  const currentCalendarDate = new Date();
  const calendarMonthLabel = currentCalendarDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const calendarYear = currentCalendarDate.getFullYear();
  const calendarMonth = currentCalendarDate.getMonth();
  const calendarFirstDay = new Date(calendarYear, calendarMonth, 1);
  const calendarLastDay = new Date(calendarYear, calendarMonth + 1, 0);
  const calendarScheduledDays = new Set(
    scheduleFollowups
      .map((followup) => parseDateTimeValue(followup.start || followup.start_time))
      .filter((date) => date && date.getFullYear() === calendarYear && date.getMonth() === calendarMonth)
      .map((date) => date.getDate())
  );
  const calendarDays = [
    ...Array.from({ length: calendarFirstDay.getDay() }, () => null),
    ...Array.from({ length: calendarLastDay.getDate() }, (_, index) => index + 1),
  ];
  const todayDateNumber = currentCalendarDate.getDate();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const overdueFollowups = followups
    .filter(f => {
      if (f.status !== "Scheduled") return false;
      const followupDate = parseDateTimeValue(f.start || f.start_time);
      return followupDate && followupDate < todayStart;
    })
    .sort((a, b) => {
      const aDate = parseDateTimeValue(a.start || a.start_time)?.getTime() || 0;
      const bDate = parseDateTimeValue(b.start || b.start_time)?.getTime() || 0;
      return aDate - bDate;
    });
  const overdueByPerson = Object.entries(overdueFollowups.reduce((acc, f) => {
    const assigned = cleanText(f.assigned || f.assigned_to || "Unassigned", "Unassigned");
    acc[assigned] = (acc[assigned] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const reminderText = todayFollowups.map(f => `Call ${f.lead || f.lead_name || "customer"} - ${f.title || "Follow-up"}`).join("\n");
  const notifyTodayFollowups = async () => {
    if (!todayFollowups.length || typeof window === "undefined" || !("Notification" in window)) return;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(`Today: ${todayFollowups.length} Follow-ups Pending`, { body: reminderText });
    }
  };
  const leaderboard = userOptions.map(u => ({ name: u.value, leads: dashboardLeads.filter(l => l.assigned === u.value).length })).sort((a, b) => b.leads - a.leads);
  const findLeadByName = (leadName) => {
    const name = cleanText(leadName, "").toLowerCase();
    if (!name) return null;
    return leads.find((lead) => [lead.name, lead.company, lead.lead_name]
      .some((value) => cleanText(value, "").toLowerCase() === name)) || null;
  };
  const getLeadValue = (lead) => parseCurrencyValue(lead?.value || lead?.lead_value || lead?.amount);
  const getLeadValueByName = (leadName) => getLeadValue(findLeadByName(leadName));
  const getProposalValue = (proposal) => {
    const ownValue = parseCurrencyValue(proposal?.value || proposal?.amount);
    return ownValue || getLeadValueByName(proposal?.lead || proposal?.lead_name || proposal?.customer_name);
  };
  const getPaymentValue = (payment) => {
    const ownValue = parseCurrencyValue(payment?.amount || payment?.value || payment?.proposal_value);
    return ownValue || getLeadValueByName(payment?.lead || payment?.lead_name || payment?.customer || payment?.customer_name || payment?.company);
  };
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth();
  const chartMonthCount = Math.max(6, currentMonthIndex + 1);
  const monthNames = Array.from({ length: chartMonthCount }, (_, index) =>
    new Date(currentYear, index, 1).toLocaleString("en-US", { month: "short" })
  );
  const getChartMonthIndex = (record) => {
    const date = getDashboardRecordDate(record);
    return date && date.getFullYear() === currentYear ? date.getMonth() : currentMonthIndex;
  };
  const isWonLead = (lead) => cleanText(lead.stage, "").toLowerCase() === "won" || lead.converted;
  const pipelineGroups = [
    { stage: "Lead", matches: ["New", "Contacted"] },
    { stage: "Qualified", matches: ["Qualified"] },
    { stage: "Proposal", matches: ["Proposal"] },
    { stage: "Negotiation", matches: ["Negotiation"] },
    { stage: "Won", matches: ["Won"] },
  ];
  const pipelineData = pipelineGroups.map((group) => {
    const groupLeads = dashboardLeads.filter((lead) => {
      const stage = cleanText(lead.stage, "New");
      return group.stage === "Won" ? isWonLead(lead) : group.matches.includes(stage);
    });
    return {
      stage: group.stage,
      count: groupLeads.length,
      value: groupLeads.reduce((sum, lead) => sum + getLeadValue(lead), 0),
    };
  });
  const maxPipelineCount = Math.max(1, ...pipelineData.map(item => item.count));
  const sourceCounts = dashboardLeads.reduce((acc, lead) => {
    const source = cleanText(lead.source, "Unknown");
    if (!acc[source]) acc[source] = { count: 0, value: 0 };
    acc[source].count += 1;
    acc[source].value += getLeadValue(lead);
    return acc;
  }, {});
  const sourceData = Object.entries(sourceCounts)
    .map(([name, item]) => ({ name, count: item.count, value: item.value }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalSources = sourceData.reduce((sum, item) => sum + item.count, 0) || 1;
  const getSourcePercentage = (count) => totalSources ? ((count / totalSources) * 100).toFixed(0) : "0";
  const receivedPaymentRecords = dashboardPaymentReminders
    .filter((payment) => cleanText(payment.current_stage || payment.stage, "").toLowerCase() === "payment received")
    .map((payment) => ({ ...payment, chartValue: getPaymentValue(payment) }));
  const acceptedProposalRecords = dashboardProposals
    .filter((proposal) => cleanText(proposal.status, "").toLowerCase() === "accepted")
    .map((proposal) => ({ ...proposal, chartValue: getProposalValue(proposal) }));
  const wonLeadRecords = dashboardLeads
    .filter(isWonLead)
    .map((lead) => ({ ...lead, chartValue: getLeadValue(lead) }));
  const revenueRecords = receivedPaymentRecords.length
    ? receivedPaymentRecords
    : acceptedProposalRecords.length
      ? acceptedProposalRecords
      : wonLeadRecords;
  const revenueTrendData = monthNames.map((month, index) => ({
    month,
    revenue: revenueRecords.reduce((sum, record) => getChartMonthIndex(record) === index ? sum + parseCurrencyValue(record.chartValue) : sum, 0),
  }));
  const monthlySalesData = monthNames.map((month, index) => {
    const monthWonLeads = wonLeadRecords.filter((lead) => getChartMonthIndex(lead) === index);
    return {
      month,
      sales: monthWonLeads.length,
      value: monthWonLeads.reduce((sum, lead) => sum + parseCurrencyValue(lead.chartValue), 0),
    };
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px 0" }}>CRM Dashboard</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Overview of your sales pipeline, follow-ups, and customer relationships</p>
          <p style={{ fontSize: 12, color: COLORS.neutral, margin: "8px 0 0 0" }}>Showing: {dateFilterLabel}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          {[
            ["today", "Today"],
            ["week", "This Week"],
            ["month", "This Month"],
            ["quarter", "This Quarter"],
            ["year", "This Year"],
            ["custom", "Custom Date"],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setDateFilter(value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${dateFilter === value ? COLORS.primary : COLORS.border}`, background: dateFilter === value ? "#dcfce7" : "#fff", color: dateFilter === value ? COLORS.primary : COLORS.neutral, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {label}
            </button>
          ))}
          {dateFilter === "custom" && (
            <>
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} style={{ ...inputStyle, width: 145 }} />
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} style={{ ...inputStyle, width: 145 }} />
            </>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
        <KPICard icon={Users} label="Active Leads" value={activeLeads} color={COLORS.primary} trend={`${totalLeads} total`} onClick={() => navigate("/crm/leads")} />
        <KPICard icon={FileText} label="Pipeline Value" value={formatCurrency(totalProposalValue)} color={COLORS.secondary} onClick={() => navigate("/crm/proposals")} />
        <KPICard icon={Check} label="Accepted Value" value={formatCurrency(acceptedValue)} color={COLORS.success} onClick={() => navigate("/crm/proposals")} />
        <KPICard icon={MessageSquare} label="Pending Follow-ups" value={pendingFollowups} color={COLORS.warning} onClick={() => navigate("/crm/follow-ups")} />
      </div>



      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
        <DashboardChartCard title="Sales Pipeline" onClick={() => navigate("/crm/leads")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", justifyContent: "center" }}>
            {pipelineData.map((item, index) => (
              <div key={item.stage}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{item.stage}</span>
                  <span style={{ fontSize: 12, color: COLORS.neutral }}>{item.count} - {formatCurrency(item.value)}</span>
                </div>
                <div style={{ height: 12, borderRadius: 999, background: COLORS.border, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(6, (item.count / maxPipelineCount) * 100)}%`, height: "100%", background: DASHBOARD_CHART_COLORS[index], borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </DashboardChartCard>

        <DashboardChartCard title="Revenue Trend" onClick={() => navigate(paymentReminders.length ? "/crm/payment-reminders" : "/crm/proposals")}>
          <ResponsiveContainer width="100%" height="100%">
            <ReLineChart data={revenueTrendData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={chartCurrencyTick} width={56} />
              <Tooltip formatter={(value) => [formatCurrency(value), "Revenue"]} labelFormatter={(label) => `${label} ${currentYear}`} />
              <Line type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </ReLineChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard title="Lead Source" onClick={() => navigate("/crm/sources")}>
          {sourceData.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.neutral }}>No source data</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, height: "100%", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={sourceData} dataKey="count" nameKey="name" innerRadius={45} outerRadius={82} paddingAngle={2}>
                    {sourceData.map((entry, index) => <Cell key={entry.name} fill={DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name, item) => [`${value} leads (${getSourcePercentage(value)}%) - ${formatCurrency(item.payload.value)}`, name]} />
                </RePieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sourceData.slice(0, 6).map((item, index) => (
                  <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length] }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{item.name}</span>
                    <span style={{ color: COLORS.neutral }}>{getSourcePercentage(item.count)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DashboardChartCard>

        <DashboardChartCard title="Monthly Sales" onClick={() => navigate("/crm/reports")}>
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={monthlySalesData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value, name, item) => name === "sales" ? [`${value} won leads`, "Sales"] : [formatCurrency(item.payload.value), "Value"]} />
              <Bar dataKey="sales" fill={COLORS.secondary} radius={[6, 6, 0, 0]} />
            </ReBarChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>
      {overdueFollowups.length > 0 && (
        <div style={{ background: COLORS.bgCard, border: "1px solid #fecaca", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #fecaca", background: "#fef2f2", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0", color: COLORS.danger }}>Missed: {overdueFollowups.length} overdue follow-ups</h3>
              <p style={{ fontSize: 12, color: COLORS.neutral, margin: 0 }}>Pending follow-ups scheduled before today.</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {overdueByPerson.slice(0, 5).map(([person, count]) => (
                <span key={person} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "6px 10px", background: "#fff", border: "1px solid #fecaca", color: COLORS.danger, fontSize: 12, fontWeight: 700 }}>
                  {person}: {count}
                </span>
              ))}
              <Button size="sm" variant="secondary" icon={MessageSquare} onClick={() => navigate("/crm/follow-ups")}>Open Follow Ups</Button>
            </div>
          </div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {overdueFollowups.slice(0, 6).map(f => (
              <div key={f.id || `${f.lead || f.lead_name}-${f.start || f.start_time}`} style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{f.title || "Follow-up"}</div>
                <div style={{ fontSize: 12, color: COLORS.neutral }}>{f.lead || f.lead_name || "-"}</div>
                <div style={{ fontSize: 12, color: COLORS.neutral, marginTop: 4 }}>Assigned: {f.assigned || f.assigned_to || "Unassigned"}</div>
                <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 6 }}>{formatDateTime(f.start || f.start_time)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {todayFollowups.length > 0 && (
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, background: "#fff7ed", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px 0", color: COLORS.warning }}>Today: {todayFollowups.length} Follow-ups Pending</h3>
              <p style={{ fontSize: 12, color: COLORS.neutral, margin: 0 }}>CRM reminder, email share, WhatsApp share, and browser notification are ready.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="secondary" icon={Mail} onClick={() => { window.location.href = `mailto:?subject=Today CRM Follow-ups&body=${encodeURIComponent(reminderText)}`; }}>Email</Button>
              <Button size="sm" variant="secondary" icon={MessageSquare} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Today CRM Follow-ups\n${reminderText}`)}`, "_blank")}>WhatsApp</Button>
              <Button size="sm" icon={AlertCircle} onClick={notifyTodayFollowups}>Browser Notification</Button>
            </div>
          </div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {todayFollowups.slice(0, 6).map(f => (
              <div key={f.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, background: COLORS.bg }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: COLORS.neutral }}>{f.lead || f.lead_name || "-"}</div>
                <div style={{ fontSize: 12, color: COLORS.warning, marginTop: 6 }}>{formatDateTime(f.start || f.start_time)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Recent Leads</h3>
            <span style={{ fontSize: 12, color: COLORS.neutral }}>{dashboardLeads.length} in range</span>
          </div>
          {dashboardLeads.length === 0 && <div style={{ padding: 32, textAlign: "center", color: COLORS.neutral }}>No leads for this date range</div>}
          {dashboardLeads.slice(0, 5).map((lead, idx) => (
            <div key={lead.id} style={{ padding: "14px 20px", borderBottom: idx < 4 ? `1px solid ${COLORS.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{lead.name}</div>
                <div style={{ fontSize: 12, color: COLORS.neutral }}>{cleanText(lead.mobile || lead.phone)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: getStageColor(lead.stage), color: getStageTextColor(lead.stage), fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{lead.stage}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(lead.value)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{dateFilter === "today" ? "Today's Schedule" : `${dateFilterLabel} Schedule`}</h3>
            <Calendar size={18} color={COLORS.primary} />
          </div>
          <div style={{ padding: 16, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{calendarMonthLabel}</span>
              <button type="button" onClick={() => navigate("/crm/follow-ups")} style={{ border: "none", background: "transparent", color: COLORS.primary, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Open</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 8 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                <div key={day} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: COLORS.neutral }}>{day}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {calendarDays.map((day, index) => {
                const isToday = day === todayDateNumber;
                const hasSchedule = day && calendarScheduledDays.has(day);
                return (
                  <div key={`${day || "empty"}-${index}`} style={{ height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: isToday || hasSchedule ? 700 : 500, color: !day ? "transparent" : isToday ? "#fff" : hasSchedule ? COLORS.primary : COLORS.neutral, background: !day ? "transparent" : isToday ? COLORS.primary : hasSchedule ? "#dcfce7" : COLORS.bg, border: hasSchedule && !isToday ? `1px solid #bbf7d0` : "1px solid transparent" }}>
                    {day || "."}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {todaySchedule.length === 0 ? (
              <div style={{ padding: "14px 12px", borderRadius: 8, background: COLORS.bg, color: COLORS.neutral, fontSize: 13, textAlign: "center" }}>No follow-ups scheduled for this date range</div>
            ) : todaySchedule.slice(0, 6).map((followup) => (
              <button key={followup.id || `${followup.lead || followup.lead_name}-${followup.start || followup.start_time}`} type="button" onClick={() => navigate("/crm/follow-ups")} style={{ border: `1px solid ${COLORS.border}`, background: COLORS.bg, borderRadius: 8, padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.warning }}>{formatScheduleTime(followup.scheduleDate)}</span>
                <span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#111827" }}>{followup.title || "Follow-up"}</span>
                  <span style={{ display: "block", fontSize: 12, color: COLORS.neutral, marginTop: 2 }}>{followup.lead || followup.lead_name || "Customer"}</span>
                </span>
              </button>
            ))}
            {todaySchedule.length > 6 && (
              <button type="button" onClick={() => navigate("/crm/follow-ups")} style={{ border: "none", background: "transparent", color: COLORS.primary, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>View {todaySchedule.length - 6} more</button>
            )}
          </div>
        </div>

        <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Team Performance</h3>
          </div>
          {leaderboard.map((m, idx) => (
            <div key={m.name} style={{ padding: "14px 20px", borderBottom: idx < leaderboard.length - 1 ? `1px solid ${COLORS.border}` : "none", display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={m.name} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: COLORS.neutral }}>{m.leads} leads</div>
              </div>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{idx + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ENHANCED LEADS PAGE
// ---------------------------------------------------------------------------
const LeadsPage = ({ leads, followups = [], userOptions = DEFAULT_USER_OPTIONS, onAddLead, onImportLeads, onEditLead, onDeleteLead, onAiCall, onAddFollowup, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [viewLead, setViewLead] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [stageUpdatingId, setStageUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [editingId, setEditingId] = useState(null);
  
  useEffect(() => {
    if (!openActionMenuId) return undefined;

    const closeMenu = () => setOpenActionMenuId(null);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionMenuId]);
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importDuplicateWarnings, setImportDuplicateWarnings] = useState([]);
  const [importDuplicateRowIndexes, setImportDuplicateRowIndexes] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const fileInputRef = useRef(null);
  
  const defaultUser = firstUserValue(userOptions);

  const blankForm = {
    name: "", contact: "", email: "", phone: "", company: "", source: "Website",
    stage: "New", value: "", assigned: defaultUser, notes: "", location: "", industry: "", converted: false,
    contactType: "Lead", entityType: "Individual", contactId: "", prefix: "", firstName: "", middleName: "", lastName: "", businessName: "", altPhone: "", landline: "", dob: "", lifeStage: "Lead",
    taxNumber: "", address1: "", address2: "", city: "", state: "", country: "", zipCode: "",
    landmark: "", streetName: "", buildingNumber: "", additionalNumber: "",
    customFields: { enquiry: { date: dateInputValue(new Date()) } },
    contactPersons: [], productCategory: "Tools", machineType: "", application: "",
    requirementQuantity: 1, installationLocation: "", requirementDetails: "", budget: "",
    expectedPurchaseDate: "", quotationValue: "", competitorDetails: "", nextFollowupDate: "", nextFollowupActivity: "",
    gpsLatitude: "", gpsLongitude: "", gpsAccuracy: "", gpsCapturedAt: ""
  };
  const [formData, setFormData] = useState(blankForm);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [showContactPersons, setShowContactPersons] = useState(false);

  const [fuForm, setFuForm] = useState({
    title: "", type: "Call", category: "Sales", status: "Scheduled",
    assigned: defaultUser, start: "", end: "", desc: "", isRecurring: false, recurringDays: 7
  });

  const filteredLeads = useMemo(() =>
    leads.filter(l => {
      const q = searchTerm.toLowerCase();
      const match = !q || [l.name, l.contact, l.email, l.mobile, l.phone, l.company].some(v => (v || "").toLowerCase().includes(q));
      return match && (!filterStage || l.stage === filterStage) && (!filterSource || l.source === filterSource) && (!filterAssigned || l.assigned === filterAssigned);
    }), [leads, searchTerm, filterStage, filterSource, filterAssigned]);

  const duplicateGroups = useMemo(() => {
    const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
    const buckets = new Map();
    const addToBucket = (key, label, lead) => {
      if (!key || key.endsWith(":")) return;
      if (!buckets.has(key)) buckets.set(key, { key, label, items: [] });
      buckets.get(key).items.push(lead);
    };

    leads.forEach((lead) => {
      const phone = normalizePhone(lead.mobile || lead.phone);
      const email = normalize(lead.email);
      const name = normalize(lead.name);
      const company = normalize(lead.company);
      if (phone.length >= 6) addToBucket(`phone:${phone}`, `Same phone: ${lead.mobile || lead.phone}`, lead);
      if (email && email.includes("@")) addToBucket(`email:${email}`, `Same email: ${lead.email}`, lead);
      if (name && company) addToBucket(`name-company:${name}:${company}`, `Same name and company: ${lead.name} / ${lead.company}`, lead);
    });

    const scoreLead = (lead) =>
      (lead.stage === "Won" ? 100 : 0) +
      (lead.converted ? 80 : 0) +
      (Number(lead.value) > 0 ? 20 : 0) +
      (lead.email ? 8 : 0) +
      (lead.mobile || lead.phone ? 6 : 0) +
      (lead.company ? 4 : 0);

    return Array.from(buckets.values())
      .map((group) => {
        const unique = Array.from(new Map(group.items.map((lead) => [lead.id, lead])).values());
        const sorted = unique.sort((a, b) => scoreLead(b) - scoreLead(a) || Number(a.id || 0) - Number(b.id || 0));
        return { ...group, items: sorted, keeper: sorted[0], extras: sorted.slice(1) };
      })
      .filter((group) => group.items.length > 1);
  }, [leads]);

  const resetForm = () => { setFormData(blankForm); setEditingId(null); setShowMoreInfo(false); setShowContactPersons(false); };

  const resetImport = () => {
    setImportRows([]);
    setImportErrors([]);
    setImportDuplicateWarnings([]);
    setImportDuplicateRowIndexes([]);
    setImportFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const buildImportDuplicateCheck = (rowsToCheck) => {
    const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
    const warnings = [];
    const duplicateIndexes = new Set();
    const seen = new Map();
    const addSeen = (key, item) => {
      if (!key) return;
      seen.set(key, item);
    };

    leads.forEach((lead) => {
      const item = { source: "existing CRM", name: lead.name, company: lead.company, phone: lead.mobile || lead.phone, email: lead.email };
      const phone = normalizePhone(item.phone);
      const email = normalize(item.email);
      const name = normalize(item.name);
      const company = normalize(item.company);
      if (phone.length >= 6) addSeen("phone:" + phone, item);
      if (email && email.includes("@")) addSeen("email:" + email, item);
      if (name && company) addSeen("namecompany:" + name + "|" + company, item);
    });

    rowsToCheck.forEach((lead, index) => {
      const item = { source: "import row " + (index + 2), name: lead.name, company: lead.company, phone: lead.mobile || lead.phone, email: lead.email };
      const phone = normalizePhone(item.phone);
      const email = normalize(item.email);
      const name = normalize(item.name);
      const company = normalize(item.company);
      const checks = [
        phone.length >= 6 ? ["same phone", "phone:" + phone] : null,
        email && email.includes("@") ? ["same email", "email:" + email] : null,
        name && company ? ["same name and company", "namecompany:" + name + "|" + company] : null,
      ].filter(Boolean);

      const reasons = [];
      let firstMatch = null;
      checks.forEach(([reason, key]) => {
        const match = seen.get(key);
        if (match) {
          reasons.push(reason);
          if (!firstMatch) firstMatch = match;
        }
      });

      if (reasons.length) {
        duplicateIndexes.add(index);
        warnings.push(item.source + ": " + item.name + " skipped because it matches " + firstMatch.source + " (" + firstMatch.name + ") by " + reasons.join(", "));
        return;
      }

      checks.forEach(([, key]) => addSeen(key, item));
    });

    return { warnings: [...new Set(warnings)], duplicateIndexes: Array.from(duplicateIndexes) };
  };
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = parseLeadImportRows(rows, defaultUser);
      const duplicateCheck = buildImportDuplicateCheck(parsed.leads);
      setImportRows(parsed.leads);
      setImportErrors(parsed.errors);
      setImportDuplicateWarnings(duplicateCheck.warnings);
      setImportDuplicateRowIndexes(duplicateCheck.duplicateIndexes);
    } catch {
      setImportRows([]);
      setImportDuplicateWarnings([]);
      setImportDuplicateRowIndexes([]);
      setImportErrors(["Could not read this file. Please upload a valid CSV, XLS, or XLSX file."]);
    }
  };

  const handleImportSave = async () => {
    if (!importRows.length) { alert("No valid leads to import"); return; }
    const duplicateIndexSet = new Set(importDuplicateRowIndexes);
    const rowsToImport = importRows.filter((_, index) => !duplicateIndexSet.has(index));
    if (!rowsToImport.length) { alert("All rows are duplicates. No new leads to import."); return; }
    if (importDuplicateWarnings.length) {
      const message = [
        `${importDuplicateRowIndexes.length} duplicate row(s) will be skipped.`,
        "",
        ...importDuplicateWarnings.slice(0, 10).map((warning) => `- ${warning}`),
        importDuplicateWarnings.length > 10 ? `+ ${importDuplicateWarnings.length - 10} more duplicate warnings` : "",
        "",
        `Import ${rowsToImport.length} new lead(s) now?`
      ].filter(Boolean).join("\n");
      if (!window.confirm(message)) return;
    }
    if (!navigator.geolocation) {
      alert("This browser does not support live location. The import was not started.");
      return;
    }
    setIsImporting(true);
    setLoading(true);
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }));
      const batchLocation = {
        gpsLatitude: Number(position.coords.latitude.toFixed(7)),
        gpsLongitude: Number(position.coords.longitude.toFixed(7)),
        gpsAccuracy: Math.round(position.coords.accuracy),
        gpsCapturedAt: new Date().toISOString(),
        gpsSource: "excel_import",
      };
      const result = await onImportLeads(rowsToImport.map((lead) => ({ ...lead, ...batchLocation })));
      alert(`Imported ${result.imported} leads${importDuplicateRowIndexes.length ? `, ${importDuplicateRowIndexes.length} duplicate rows skipped` : ""}${result.failed ? `, ${result.failed} failed` : ""}${result.emailFailed ? `, ${result.emailFailed} email notifications failed` : ""}.`);
      setShowImportModal(false);
      resetImport();
    } catch (err) {
      const message = err?.code === 1
        ? "Location permission was denied. Please allow location access and click Import Leads again."
        : err?.code === 2 || err?.code === 3
          ? "Your live location could not be obtained. Please enable device location and try again."
          : "Import failed: " + err.message;
      alert(message);
    } finally { setLoading(false); setIsImporting(false); }
  };

  const downloadLeadTemplate = () => exportCSV(leadImportTemplateRows, "lead-import-template.csv");

  const openEdit = (lead) => {
    setFormData(normalizeLeadForForm(lead, blankForm));
    setEditingId(lead.id);
    setShowModal(true);
  };

  const findLeadDuplicateWarnings = (leadName) => {
    const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
    const phone = normalizePhone(formData.phone || formData.mobile);
    const email = normalize(formData.email);
    const name = normalize(leadName);
    const company = normalize(formData.entityType === "Business" ? (formData.company || formData.businessName || leadName) : formData.company);

    return leads
      .filter((lead) => String(lead.id) !== String(editingId || ""))
      .map((lead) => {
        const reasons = [];
        const leadPhone = normalizePhone(lead.mobile || lead.phone);
        const leadEmail = normalize(lead.email);
        const leadNameNorm = normalize(lead.name);
        const leadCompany = normalize(lead.company);
        if (phone && leadPhone && phone === leadPhone) reasons.push("same phone");
        if (email && leadEmail && email === leadEmail) reasons.push("same email");
        if (name && company && name === leadNameNorm && company === leadCompany) reasons.push("same name and company");
        return reasons.length ? { lead, reasons } : null;
      })
      .filter(Boolean);
  };

  const handleSave = async () => {
  const leadName = formData.entityType === "Business"
    ? (formData.businessName || formData.company || formData.name || "").trim()
    : ([formData.prefix, formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(" ") || formData.name || "").trim();
  if (!leadName || !formData.phone) { alert("Name and Mobile are required"); return; }
  const duplicateWarnings = findLeadDuplicateWarnings(leadName);
  if (duplicateWarnings.length) {
    const message = [
      "Possible duplicate lead found before saving:",
      "",
      ...duplicateWarnings.slice(0, 5).map(({ lead, reasons }) => `- ${lead.name} / ${lead.company || "-"} / ${lead.mobile || lead.phone || "-"} (${reasons.join(", ")})`),
      duplicateWarnings.length > 5 ? `+ ${duplicateWarnings.length - 5} more duplicate matches` : "",
      "",
      "Do you still want to save this lead?"
    ].filter(Boolean).join("\n");
    if (!window.confirm(message)) return;
  }
  setLoading(true);
  try {
    const payload = {
      ...formData,
      name: leadName,
      mobile: formData.phone,
      company: formData.entityType === "Business" ? (formData.company || formData.businessName || leadName) : formData.company,
      contact: formData.contact || [formData.firstName, formData.lastName].filter(Boolean).join(" "),
      contactType: formData.contactType || formData.lifeStage || "Lead",
      value: Number(formData.value) || 0,
    };
    if (editingId) { await onEditLead(editingId, payload); }
    else { await onAddLead(payload); }
    setShowModal(false); resetForm(); onRefresh();
  } catch (err) { alert("Error saving lead: " + err.message); }
  finally { setLoading(false); }
};

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    setLoading(true);
    try { await onDeleteLead(id); onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleDeleteDuplicateExtras = async (group) => {
    const ids = group.extras.map((lead) => lead.id).filter(Boolean);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} duplicate lead(s) and keep "${group.keeper?.name || "main lead"}"?`)) return;
    setLoading(true);
    try {
      for (const id of ids) {
        await onDeleteLead(id);
      }
      await onRefresh();
      alert(`Deleted ${ids.length} duplicate lead(s).`);
    } catch (err) {
      alert("Error deleting duplicates: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const followupsForLead = (lead) => followups.filter(f => (f.lead || f.lead_name || "") === lead.name);
 const getLastFollowup = (lead) => {
    const past = followupsForLead(lead).filter(f => f.start && new Date(f.start) <= new Date()).sort((a, b) => new Date(b.start) - new Date(a.start));
    return past[0] || null;
  };
  const getUpcomingFollowup = (lead) => {
    const upcoming = followupsForLead(lead).filter(f => f.status === "Scheduled" && f.start).sort((a, b) => new Date(a.start) - new Date(b.start));
    return upcoming[0] || null;
  };
  const openFollowupModal = (lead) => {
    setSelectedLead(lead);
    setFuForm({ title: "", type: "Call", category: "Sales", status: "Scheduled", assigned: defaultUser, start: "", end: "", desc: "", isRecurring: false, recurringDays: 7 });
    setShowFollowupModal(true);
  };

  const handleSaveFollowup = async () => {
    if (!fuForm.title || !fuForm.start) { alert("Title and Start Time are required"); return; }
    setLoading(true);
    try {
      await onAddFollowup({ ...fuForm, start: toDateTimeLocalValue(fuForm.start), end: toDateTimeLocalValue(fuForm.end), lead: selectedLead.name });
      setShowFollowupModal(false);
      onRefresh();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

 


  const getInlineStageOptions = (stage) => {
    const currentStage = stage || "New";
    if (currentStage === "Won" || currentStage === "Lost") return [currentStage];

    const currentIndex = LEAD_STAGE_FLOW.indexOf(currentStage);
    const options = currentIndex >= 0
      ? [currentStage, LEAD_STAGE_FLOW[currentIndex + 1]].filter(Boolean)
      : [currentStage];

    if (!options.includes("Lost")) options.push("Lost");
    return Array.from(new Set(options));
  };

  const buildStageUpdatePayload = (lead, nextStage) => {
    const existing = normalizeLeadForForm(lead, blankForm);
    const individualName = [existing.prefix, existing.firstName, existing.middleName, existing.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const leadName = existing.entityType === "Business"
      ? (existing.businessName || existing.company || existing.name || lead.name || "").trim()
      : (individualName || existing.name || lead.name || "").trim();

    return {
      ...existing,
      stage: nextStage,
      name: leadName,
      mobile: existing.phone || lead.mobile || lead.phone || "",
      company: existing.entityType === "Business" ? (existing.company || existing.businessName || leadName) : existing.company,
      contact: existing.contact || [existing.firstName, existing.lastName].filter(Boolean).join(" "),
      contactType: existing.contactType || existing.lifeStage || "Lead",
      value: Number(existing.value) || 0,
    };
  };

  const handleInlineStageChange = async (lead, nextStage) => {
    if (!nextStage || nextStage === lead.stage) return;
    if (nextStage === "Won") {
      alert("Accept a proposal first. Won leads now move to Payments automatically.");
      return;
    }

    setStageUpdatingId(lead.id);
    try {
      await onEditLead(lead.id, buildStageUpdatePayload(lead, nextStage));
    } catch (error) {
      alert("Error updating lead stage: " + error.message);
    } finally {
      setStageUpdatingId(null);
    }
  };

  const handleAiCall = (lead) => {
    if (typeof onAiCall !== "function") {
      alert("AI Call is not configured for this page.");
      return;
    }
    onAiCall(lead);
  };
  const runLeadAction = (action) => {
    setOpenActionMenuId(null);
    action();
  };

  const leadActionMenuButtonStyle = {
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    background: "#fff",
    color: COLORS.text,
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1
  };

  const leadActionMenuStyle = {
    position: "absolute",
    top: 38,
    right: 0,
    zIndex: 80,
    width: 230,
    padding: 6,
    background: "#fff",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    boxShadow: "0 14px 32px rgba(15, 23, 42, 0.16)"
  };

  const leadActionMenuItemStyle = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: COLORS.text,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "left"
  };

  const leadActionDangerItemStyle = {
    ...leadActionMenuItemStyle,
    color: COLORS.danger
  };

 return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Leads Management</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Manage all your sales leads - {filteredLeads.length} records</p>
        </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Button variant="secondary" icon={AlertCircle} onClick={() => setShowDuplicatesModal(true)}>
            Duplicates{duplicateGroups.length ? ` (${duplicateGroups.length})` : ""}
          </Button>
          <Button variant="secondary" icon={Upload} onClick={() => { resetImport(); setShowImportModal(true); }}>Import CSV / Excel</Button>
          <Button icon={Plus} onClick={() => { resetForm(); setShowModal(true); }}>Add Lead</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        {LEAD_STAGES.map(s => {
          const cnt = leads.filter(l => l.stage === s).length;
          const color = getStageTextColor(s);
          return (
            <div key={s} onClick={() => setFilterStage(filterStage === s ? "" : s)}
              style={{ background: COLORS.bgCard, border: `1px solid ${filterStage === s ? color : COLORS.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}>
              <div style={{ fontSize: 11, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase" }}>{s}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{cnt}</div>
            </div>
          );
        })}
      </div>

      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search leads..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 220, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <FilterGroup label="Stage">
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ ...inputStyle, width: 140 }}>
            <option value="">All</option>{LEAD_STAGES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Source">
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="">All</option>{LEAD_SOURCES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Assigned">
          <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="">All</option>{userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FilterGroup>
        <button onClick={() => { setFilterStage(""); setFilterSource(""); setFilterAssigned(""); setSearchTerm(""); }} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
        <div style={{ marginLeft: "auto", marginTop: 16 }}>
          <Button variant="secondary" size="sm" icon={Download}
            onClick={() => exportCSV([["Name", "Company", "Phone", "Email", "Location", "Industry", "Product Category", "Machine Type", "Application", "Quantity", "Requirement Details", "Budget", "Expected Purchase Date", "Quotation Value", "Competitor Details", "Next Follow-up", "Activity", "Latitude", "Longitude", "GPS Accuracy", "GPS Captured At", "Source", "Stage", "Assigned", "Status"], ...filteredLeads.map(l => [l.name, l.company||"-", l.mobile||l.phone||"-", l.email||"-", l.location||"-", l.industry||"-", l.product_category||"-", l.machine_type||"-", l.application||"-", l.requirement_quantity||0, l.requirement_details||"-", l.budget||0, l.expected_purchase_date||"-", l.quotation_value||0, l.competitor_details||"-", l.next_followup_date||"-", l.next_followup_activity||"-", l.gps_latitude??"", l.gps_longitude??"", l.gps_accuracy??"", l.gps_captured_at||"", l.source, l.stage, l.assigned, l.converted ? "Customer" : "Active"])], "leads.csv")}>
            Export
          </Button>
        </div>
      </FilterBar>

      <TableCard title="All Leads" count={filteredLeads.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Name", "Company", "Location", "Phone", "Email", "Source", "Stage", "Value", "Assigned", "Last Follow-up", "Next Follow-up", "Status", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? <NoData cols={12} /> :
             filteredLeads.map(lead => {
  const upcomingFu = getUpcomingFollowup(lead);
  const lastFu = getLastFollowup(lead);
  return (
                  <tr key={lead.id}>
                    <Td><span style={{ fontWeight: 600 }}>{lead.name}</span></Td>
                    <Td>{cleanText(lead.company)}</Td>
                    <Td style={{ fontSize: 12, color: COLORS.neutral }}>{cleanText(lead.location)}</Td>
                    <Td>{cleanText(lead.mobile || lead.phone)}</Td>
                    <Td style={{ color: COLORS.secondary }}>{cleanText(lead.email)}</Td>
                    <Td><span style={{ padding: "3px 8px", borderRadius: 6, background: "#f3f4f6", color: "#374151", fontSize: 11, fontWeight: 600 }}>{lead.source}</span></Td>
                    <Td>
                      <select
                        value={lead.stage || "New"}
                        onChange={(event) => handleInlineStageChange(lead, event.target.value)}
                        disabled={stageUpdatingId === lead.id || lead.stage === "Won"}
                        title={lead.stage === "Won" ? "Won is controlled by accepted proposal and payments" : "Update lead stage"}
                        style={{
                          ...inputStyle,
                          minWidth: 132,
                          height: 34,
                          padding: "4px 8px",
                          borderRadius: 8,
                          background: getStageColor(lead.stage),
                          color: getStageTextColor(lead.stage),
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: lead.stage === "Won" ? "not-allowed" : "pointer",
                          opacity: stageUpdatingId === lead.id ? 0.65 : 1,
                        }}
                      >
                        {getInlineStageOptions(lead.stage).map((stage) => (
                          <option key={stage} value={stage}>{stage}</option>
                        ))}
                      </select>
                    </Td>
                    <Td style={{ fontWeight: 700 }}>{lead.value ? formatCurrency(lead.value) : "-"}</Td>
                    <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={lead.assigned} size={28} /><span style={{ fontSize: 11, color: COLORS.neutral }}>{lead.assigned?.split(" ")[0]}</span></div></Td>
                  <Td style={{ fontSize: 12, color: COLORS.neutral }}>{lastFu ? formatDateTime(lastFu.start) : "-"}</Td>
<Td>
  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
    {upcomingFu && <span style={{ fontSize: 12, color: COLORS.neutral }}>{formatDateTime(upcomingFu.start)}</span>}
    <button onClick={() => openFollowupModal(lead)} style={{ background: COLORS.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}><Plus size={12} /> Add</button>
  </div>
</Td>
                    <Td>{lead.converted ? <StatusBadge status="Customer" /> : <StatusBadge status="Active" />}</Td>
                    <Td>
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenActionMenuId(openActionMenuId === lead.id ? null : lead.id);
                          }}
                          style={leadActionMenuButtonStyle}
                          title="More actions"
                          aria-label={`More actions for ${lead.name || "lead"}`}
                        >
                          ⋮
                        </button>
                        {openActionMenuId === lead.id && (
                          <div style={leadActionMenuStyle} onClick={(event) => event.stopPropagation()}>
                            <button type="button" style={leadActionMenuItemStyle} onClick={() => runLeadAction(() => setViewLead(lead))}>
                              <Eye size={15} /> View
                            </button>
                            <button type="button" style={leadActionMenuItemStyle} onClick={() => runLeadAction(() => openEdit(lead))}>
                              <Edit2 size={15} /> Edit
                            </button>
                            <button type="button" style={leadActionDangerItemStyle} onClick={() => runLeadAction(() => handleDelete(lead.id))}>
                              <Trash2 size={15} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </TableCard>

      {/* Duplicate Leads Modal */}
      <Modal title="Duplicate Leads" open={showDuplicatesModal} onClose={() => setShowDuplicatesModal(false)} maxWidth={900}>
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div style={{ background: "#f8fafc", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, fontSize: 13, color: COLORS.neutral }}>
            Duplicate check uses same phone, same email, or same lead name with company. The first record shown is kept; only the extra records in that group are deleted.
          </div>
          {duplicateGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: 28, color: COLORS.neutral, border: `1px dashed ${COLORS.border}`, borderRadius: 8 }}>
              No duplicate leads found.
            </div>
          ) : duplicateGroups.map((group) => (
            <div key={group.key} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden", background: COLORS.bgCard }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 14px", background: COLORS.bg }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{group.label}</div>
                  <div style={{ fontSize: 12, color: COLORS.neutral }}>{group.items.length} matching leads found</div>
                </div>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteDuplicateExtras(group)} disabled={loading}>
                  Delete {group.extras.length} duplicate{group.extras.length === 1 ? "" : "s"}
                </Button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Action", "Name", "Company", "Phone", "Email", "Stage", "Assigned"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {group.items.map((lead) => (
                      <tr key={lead.id}>
                        <Td><StatusBadge status={lead.id === group.keeper?.id ? "Keep" : "Duplicate"} /></Td>
                        <Td><span style={{ fontWeight: 700 }}>{lead.name}</span></Td>
                        <Td>{cleanText(lead.company)}</Td>
                        <Td>{cleanText(lead.mobile || lead.phone)}</Td>
                        <Td style={{ color: COLORS.secondary }}>{cleanText(lead.email)}</Td>
                        <Td>{lead.stage}</Td>
                        <Td>{lead.assigned || "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="secondary" onClick={() => setShowDuplicatesModal(false)}>Close</Button>
        </div>
      </Modal>

      {/* Import Leads Modal */}
      <Modal title="Import Leads" open={showImportModal} onClose={() => { setShowImportModal(false); resetImport(); }} maxWidth={850} preventClose={isImporting}>
        <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Upload CSV, XLS, or XLSX file</div>
              <div style={{ fontSize: 12, color: COLORS.neutral }}>Required columns: Lead Name and Phone. Other columns are optional.</div>
              <div style={{ fontSize: 12, color: COLORS.primary, marginTop: 5 }}><MapPin size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />When you click Import Leads, the browser will capture your current location once and save it for every lead in this batch.</div>
            </div>
            <Button variant="secondary" size="sm" icon={Download} onClick={downloadLeadTemplate}>Template</Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={handleImportFile}
            style={inputStyle}
          />
          {importFileName && <div style={{ fontSize: 12, color: COLORS.neutral }}>Selected: {importFileName}</div>}
          {isImporting && (
            <div style={{ background: "#eef6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>
              Importing leads... please wait until the process completes.
            </div>
          )}
          {importDuplicateWarnings.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.danger, marginBottom: 6 }}>Duplicate leads found before import</div>
              {importDuplicateWarnings.slice(0, 8).map((warning) => <div key={warning} style={{ fontSize: 12, color: COLORS.danger }}>{warning}</div>)}
              {importDuplicateWarnings.length > 8 && <div style={{ fontSize: 12, color: COLORS.danger }}>+ {importDuplicateWarnings.length - 8} more</div>}
            </div>
          )}
          {importErrors.length > 0 && (
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.warning, marginBottom: 6 }}>Skipped rows / warnings</div>
              {importErrors.slice(0, 6).map((err) => <div key={err} style={{ fontSize: 12, color: COLORS.warning }}>{err}</div>)}
              {importErrors.length > 6 && <div style={{ fontSize: 12, color: COLORS.warning }}>+ {importErrors.length - 6} more</div>}
            </div>
          )}
          {importRows.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", background: COLORS.bg, fontSize: 13, fontWeight: 700 }}>Preview: {Math.max(importRows.length - importDuplicateRowIndexes.length, 0)} leads ready{importDuplicateRowIndexes.length ? `, ${importDuplicateRowIndexes.length} duplicates skipped` : ""}</div>
              <div style={{ overflowX: "auto", maxHeight: 260 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Import", "Name", "Phone", "Company", "Email", "Source", "Stage", "Value", "Assigned"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {importRows.slice(0, 8).map((lead, idx) => {
                      const isDuplicate = importDuplicateRowIndexes.includes(idx);
                      return (
                        <tr key={`${lead.name}-${idx}`} style={{ background: isDuplicate ? "#fef2f2" : "transparent" }}>
                          <Td>{isDuplicate ? "Skip duplicate" : "Import"}</Td><Td>{lead.name}</Td><Td>{lead.phone}</Td><Td>{lead.company || "-"}</Td><Td>{lead.email || "-"}</Td><Td>{lead.source}</Td><Td>{lead.stage}</Td><Td>{formatCurrency(lead.value)}</Td><Td>{lead.assigned}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => { if (!isImporting) { setShowImportModal(false); resetImport(); } }} disabled={loading}>Cancel</Button>
          <Button onClick={handleImportSave} disabled={loading || importRows.length === 0}>{isImporting ? "Importing..." : "Import Leads"}</Button>
        </div>
      </Modal>

      {/* Add/Edit Lead Modal */}
      <Modal title={editingId ? "Edit Lead" : "Add a new contact"} open={showModal} onClose={() => { setShowModal(false); resetForm(); }} maxWidth={900}>
        <LeadFormSection formData={formData} setFormData={setFormData} title="Lead Information" userOptions={userOptions} />
        <EnquiryFields formData={formData} setFormData={setFormData} />
        <MachineRequirementSection formData={formData} setFormData={setFormData} userOptions={userOptions} />
        <AdditionalInfoSection formData={formData} setFormData={setFormData} userOptions={userOptions} />

        {/* More Informations (collapsible) */}
        <div style={{ marginBottom: 24 }}>
          <button type="button" onClick={() => setShowMoreInfo(!showMoreInfo)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700, color: COLORS.primary, marginBottom: showMoreInfo ? 16 : 0 }}>
            More Informations <ChevronDown size={16} style={{ transform: showMoreInfo ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {showMoreInfo && (
            <div style={{ paddingTop: 4 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Tax Number</label>
                <input value={formData.taxNumber} onChange={e => setFormData({ ...formData, taxNumber: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {[["Address Line 1", "address1"], ["Address Line 2", "address2"], ["City", "city"], ["State", "state"], ["Country", "country"], ["Zip Code", "zipCode"], ["Landmark", "landmark"], ["Street Name", "streetName"], ["Building Number", "buildingNumber"], ["Additional Number", "additionalNumber"]].map(([lbl, key]) => (
                  <div key={key}>
                    <label style={labelStyle}>{lbl}</label>
                    <input value={formData[key] || ""} onChange={e => setFormData({ ...formData, [key]: e.target.value })} style={inputStyle} />
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <div key={n}>
                    <label style={labelStyle}>Custom Field {n}</label>
                    <input value={formData.customFields[`field${n}`] || ""} onChange={e => setFormData({ ...formData, customFields: { ...formData.customFields, [`field${n}`]: e.target.value } })} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add Contact Persons (collapsible) */}
        <div style={{ marginBottom: 24 }}>
          <button type="button" onClick={() => setShowContactPersons(!showContactPersons)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700, color: COLORS.primary, marginBottom: showContactPersons ? 16 : 0 }}>
            Add Contact Persons <ChevronDown size={16} style={{ transform: showContactPersons ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {showContactPersons && (
            <div style={{ display: "grid", gap: 20 }}>
              {[0, 1, 2].map(idx => {
                const cp = formData.contactPersons[idx] || { prefix: "", firstName: "", lastName: "", email: "", mobile: "", altPhone: "", familyPhone: "", department: "", designation: "", commission: "", allowLogin: false };
                const updateCP = (field, val) => {
                  const updated = [...formData.contactPersons];
                  updated[idx] = { ...cp, [field]: val };
                  setFormData({ ...formData, contactPersons: updated });
                };
                return (
                  <div key={idx} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Contact Person {idx + 1}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><label style={labelStyle}>Prefix</label><input value={cp.prefix} onChange={e => updateCP("prefix", e.target.value)} style={inputStyle} placeholder="Mr / Mrs / Miss" /></div>
                      <div><label style={labelStyle}>First Name</label><input value={cp.firstName} onChange={e => updateCP("firstName", e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Last Name</label><input value={cp.lastName} onChange={e => updateCP("lastName", e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><label style={labelStyle}>Email</label><input value={cp.email} onChange={e => updateCP("email", e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Mobile Number</label><input value={cp.mobile} onChange={e => updateCP("mobile", e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><label style={labelStyle}>Alternate Contact Number</label><input value={cp.altPhone} onChange={e => updateCP("altPhone", e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Family Contact Number</label><input value={cp.familyPhone} onChange={e => updateCP("familyPhone", e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><label style={labelStyle}>Department</label><input value={cp.department} onChange={e => updateCP("department", e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Designation</label><input value={cp.designation} onChange={e => updateCP("designation", e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                      <div><label style={labelStyle}>Sales Commission Percentage (%)</label><input type="number" value={cp.commission} onChange={e => updateCP("commission", e.target.value)} style={inputStyle} /></div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingTop: 18 }}>
                        <input type="checkbox" checked={cp.allowLogin} onChange={e => updateCP("allowLogin", e.target.checked)} /> Allow login
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{editingId ? "Update" : "Save"}</Button>
        </div>
      </Modal>

      {/* Add Follow-up Modal */}
      <Modal title={`Add Follow-up - ${selectedLead?.name || ""}`} open={showFollowupModal} onClose={() => setShowFollowupModal(false)} maxWidth={750}>
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={fuForm.title} onChange={e => setFuForm({ ...fuForm, title: e.target.value })} style={inputStyle} placeholder="e.g. Follow-up call" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={fuForm.type} onChange={e => setFuForm({ ...fuForm, type: e.target.value })} style={inputStyle}>
                {FOLLOW_UP_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={fuForm.category} onChange={e => setFuForm({ ...fuForm, category: e.target.value })} style={inputStyle}>
                {FOLLOW_UP_CATEGORIES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <DateTimeFields
              label="Start Time *"
              value={fuForm.start}
              onChange={(value) => setFuForm({ ...fuForm, start: value })}
              required
            />
            <DateTimeFields
              label="End Time"
              value={fuForm.end}
              onChange={(value) => setFuForm({ ...fuForm, end: value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Assigned To</label>
            <select value={fuForm.assigned} onChange={e => setFuForm({ ...fuForm, assigned: e.target.value, assignedUserId: userIdForValue(userOptions, e.target.value) })} style={inputStyle}>
              {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={fuForm.desc} onChange={e => setFuForm({ ...fuForm, desc: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} placeholder="Add detailed description..." />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="recurring" checked={fuForm.isRecurring} onChange={e => setFuForm({ ...fuForm, isRecurring: e.target.checked })} />
            <label htmlFor="recurring" style={{ fontSize: 13, fontWeight: 500 }}>Recurring every</label>
            <input type="number" value={fuForm.recurringDays} onChange={e => setFuForm({ ...fuForm, recurringDays: Number(e.target.value) })} min="1" style={{ ...inputStyle, width: 60 }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>days</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setShowFollowupModal(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSaveFollowup} disabled={loading}>Save</Button>
        </div>
      </Modal>

      {/* View Lead Modal */}
      <Modal title="Lead Details" open={!!viewLead} onClose={() => setViewLead(null)} maxWidth={700}>
        {viewLead && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 20 }}>
              {[["Name", viewLead.name], ["Company", viewLead.company || "-"], ["Phone", viewLead.mobile || viewLead.phone || "-"], ["Email", viewLead.email || "-"], ["Location", viewLead.location || "-"], ["Industry", viewLead.industry || "-"], ["Source", viewLead.source || "-"], ["Stage", viewLead.stage], ["Value", viewLead.value ? formatCurrency(viewLead.value) : "-"], ["Assigned", viewLead.assigned], ["Status", viewLead.converted ? "Customer" : "Active"]].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: COLORS.neutral, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>
            {viewLead.gps_latitude != null && viewLead.gps_longitude != null && (
              <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div><strong>Captured GPS:</strong> {viewLead.gps_latitude}, {viewLead.gps_longitude}<br/><span style={{ fontSize: 11, color: COLORS.neutral }}>Accuracy: approximately {viewLead.gps_accuracy || "-"} m · {viewLead.gps_captured_at ? formatDate(viewLead.gps_captured_at) : ""}</span></div>
                <Button size="sm" icon={MapPin} onClick={() => window.open(`https://www.google.com/maps?q=${viewLead.gps_latitude},${viewLead.gps_longitude}`, "_blank", "noopener,noreferrer")}>Open Map</Button>
              </div>
            )}
            {viewLead.notes && <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}><strong>Notes:</strong> {viewLead.notes}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setViewLead(null)}>Close</Button>
              <Button onClick={() => { setViewLead(null); openEdit(viewLead); }}>Edit</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ENHANCED FOLLOW-UPS PAGE
// ---------------------------------------------------------------------------
const FollowUpsPage = ({ followups, leads, userOptions = DEFAULT_USER_OPTIONS, onAddFollowup, onEditFollowup, onDeleteFollowup, onMarkComplete, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [loading, setLoading] = useState(false);
  const defaultUser = firstUserValue(userOptions);

  const blankForm = {
    lead: "", title: "", type: "Call", category: "Sales", status: "Scheduled",
    assigned: defaultUser, start: "", end: "", desc: "", isRecurring: false, recurringDays: 7
  };
 const [formData, setFormData] = useState(blankForm);
const [editingId, setEditingId] = useState(null);
const openEditFollowup = (f) => {
  setFormData({ lead: f.lead || f.lead_name || "", title: f.title, type: f.type, category: f.category, status: f.status, assigned: f.assigned, assignedUserId: f.assignedUserId || f.assigned_user_id || null, start: toDateTimeLocalValue(f.start || f.start_time), end: toDateTimeLocalValue(f.end || f.end_time), desc: f.desc || "", isRecurring: false, recurringDays: 7 });
  setEditingId(f.id);
  setShowModal(true);
};

  const assignedFilterOptions = userOptions;

  const filtered = useMemo(() =>
    followups.filter(f => {
      const q = searchTerm.toLowerCase();
      const match = !q || [f.lead, f.lead_name, f.title, f.assigned].some(v => (v || "").toLowerCase().includes(q));
      const assignedMatch = !filterAssigned || cleanText(f.assigned, "") === filterAssigned;
      return match && (!filterStatus || f.status === filterStatus) && (!filterType || f.type === filterType) && (!filterCategory || f.category === filterCategory) && assignedMatch;
    }), [followups, searchTerm, filterStatus, filterType, filterCategory, filterAssigned]);

const handleSave = async () => {
    if (!formData.title || !formData.lead) { alert("Title and Lead are required"); return; }
    setLoading(true);
    try {
      const payload = { ...formData, start: toDateTimeLocalValue(formData.start), end: toDateTimeLocalValue(formData.end) };
      if (editingId) { await onEditFollowup(editingId, payload); }
      else { await onAddFollowup(payload); }
      setShowModal(false); setFormData(blankForm); setEditingId(null); onRefresh();
    }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this follow-up?")) return;
    setLoading(true);
    try { await onDeleteFollowup(id); onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleComplete = async (id) => {
    setLoading(true);
    try { await onMarkComplete(id); onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const scheduled = followups.filter(f => f.status === "Scheduled").length;
  const completed = followups.filter(f => f.status === "Completed").length;
  const cancelled = followups.filter(f => f.status === "Cancelled").length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Follow-ups Management</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Schedule and track follow-up activities - {filtered.length} records</p>
        </div>
        <Button icon={Plus} onClick={() => { setFormData(blankForm); setShowModal(true); }}>Add Follow-up</Button>
      </div>

     <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[["Scheduled", scheduled, COLORS.warning], ["Completed", completed, COLORS.success], ["Cancelled", cancelled, COLORS.danger]].map(([label, val, color]) => (
          <div key={label}
            onClick={() => setFilterStatus(filterStatus === label ? "" : label)}
            style={{ background: COLORS.bgCard, border: `1px solid ${filterStatus === label ? color : COLORS.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 20, cursor: "pointer" }}>
            <div style={{ fontSize: 12, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>
      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 200, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <FilterGroup label="Status">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 140 }}>
            <option value="">All</option>{FOLLOW_UP_STATUS.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Type">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 130 }}>
            <option value="">All</option>{FOLLOW_UP_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Category">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: 130 }}>
            <option value="">All</option>{FOLLOW_UP_CATEGORIES.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Assigned">
          <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)} style={{ ...inputStyle, width: 190 }}>
            <option value="">All</option>
            {assignedFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FilterGroup>
        <button onClick={() => { setFilterStatus(""); setFilterType(""); setFilterCategory(""); setFilterAssigned(""); setSearchTerm(""); }} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
      </FilterBar>

      <TableCard title="All Follow-ups" count={filtered.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Lead", "Title", "Type", "Category", "Status", "Assigned", "Start", "End", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={8} /> :
              filtered.map(f => (
                <tr key={f.id}>
                  <Td style={{ fontWeight: 600 }}>{f.lead || f.lead_name || "-"}</Td>
                  <Td>{f.title}</Td>
                  <Td><StatusBadge status={f.type} /></Td>
                  <Td><span style={{ padding: "3px 8px", borderRadius: 6, background: COLORS.bg, fontSize: 11, fontWeight: 600 }}>{f.category}</span></Td>
                  <Td><StatusBadge status={f.status} /></Td>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={f.assigned} size={28} />{f.assigned?.split(" ")[0]}</div></Td>
                 <Td style={{ fontSize: 12, color: COLORS.neutral }}>{formatDateTime(f.start)}</Td>
<Td style={{ fontSize: 12, color: COLORS.neutral }}>{formatDateTime(f.end)}</Td>
<Td>
  <div style={{ display: "flex", gap: 4 }}>
    <button onClick={() => openEditFollowup(f)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.warning, padding: "4px 6px" }} title="Edit"><Edit2 size={15} /></button>
    {f.status === "Scheduled" && <button onClick={() => handleComplete(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.success, padding: "4px 6px" }} title="Mark Complete"><CheckCircle2 size={15} /></button>}
    <button onClick={() => handleDelete(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: "4px 6px" }} title="Delete"><Trash2 size={15} /></button>
  </div>
</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableCard>

      <Modal title="Add Follow-up" open={showModal} onClose={() => { setShowModal(false); setFormData(blankForm); }} maxWidth={750}>
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Customer/Lead *</label>
            <input list="fuLeads" value={formData.lead} onChange={e => setFormData({ ...formData, lead: e.target.value })} style={inputStyle} placeholder="Type or select a lead" />
            <datalist id="fuLeads">{leads.map(l => <option key={l.id} value={l.name} />)}</datalist>
          </div>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} style={inputStyle} placeholder="e.g. Follow-up call" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={inputStyle}>
                {FOLLOW_UP_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} style={inputStyle}>
                {FOLLOW_UP_CATEGORIES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <DateTimeFields
              label="Start Time *"
              value={formData.start}
              onChange={(value) => setFormData({ ...formData, start: value })}
              required
            />
            <DateTimeFields
              label="End Time"
              value={formData.end}
              onChange={(value) => setFormData({ ...formData, end: value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Assigned To</label>
            <select value={formData.assigned} onChange={e => setFormData({ ...formData, assigned: e.target.value, assignedUserId: userIdForValue(userOptions, e.target.value) })} style={inputStyle}>
              {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} placeholder="Add detailed notes..." />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="recurring" checked={formData.isRecurring} onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })} />
            <label htmlFor="recurring" style={{ fontSize: 13, fontWeight: 500 }}>Recurring every</label>
            <input type="number" value={formData.recurringDays} onChange={e => setFormData({ ...formData, recurringDays: Number(e.target.value) })} min="1" style={{ ...inputStyle, width: 60 }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>days</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => { setShowModal(false); setFormData(blankForm); setEditingId(null); }} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{editingId ? "Update" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ENHANCED PROPOSALS PAGE
// ---------------------------------------------------------------------------
const buildStandardProposalBody = ({ leadName, value, dueDate }) => {
  const customer = cleanText(leadName, 'Customer');
  const amount = formatCurrency(parseCurrencyValue(value));
  const validity = dueDate ? formatDate(dueDate) : '7 days from quotation date';
  return `
    <p>Dear ${customer},</p>
    <p>Thank you for your enquiry. Please find our standard quotation for your requirement.</p>
    <table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">
      <tbody>
        <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Customer / Lead</td><td style="border:1px solid #e5e7eb; padding:8px;">${customer}</td></tr>
        <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Quotation Value</td><td style="border:1px solid #e5e7eb; padding:8px;"><strong>${amount}</strong></td></tr>
        <tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600;">Validity</td><td style="border:1px solid #e5e7eb; padding:8px;">${validity}</td></tr>
      </tbody>
    </table>
    <p><strong>Scope of Work</strong></p>
    <ul>
      <li>Product selection and technical requirement confirmation</li>
      <li>Supply of quoted CNC tools and accessories</li>
      <li>Delivery as per agreed schedule and availability</li>
      <li>Technical/application support as agreed</li>
    </ul>
    <p><strong>Terms</strong></p>
    <ul>
      <li>Taxes, hosting, third-party charges, and custom changes will be billed as applicable.</li>
      <li>Delivery timeline starts after confirmation and receipt of required documents.</li>
    </ul>
    <p>Kindly review and confirm so we can proceed with the next step.</p>
    <p>Regards,<br/>Manod Technologies</p>
  `;
};

const isStandardProposalBody = (body = '') => {
  const text = String(body || '');
  return !text || text.includes('Thank you for your enquiry') || text.includes('Quotation Value') || text.includes('Estimated value:');
};
const RichTextEditor = ({ value, onChange }) => {
  const editorRef = React.useRef(null);

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 4, padding: 8, background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap" }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("bold"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer", fontWeight: 700 }}>B</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("italic"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer", fontStyle: "italic" }}>I</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("underline"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer", textDecoration: "underline" }}>U</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("justifyLeft"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>Left</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("justifyCenter"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>Center</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("justifyRight"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>Right</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>- List</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>1. List</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); const url = prompt("Enter URL:"); if (url) exec("createLink", url); }} style={{ padding: "4px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "white", cursor: "pointer" }}>Link</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={e => onChange(e.currentTarget.innerHTML)}
        style={{ minHeight: 160, padding: 12, fontSize: 13, outline: "none" }}
      />
    </div>
  );
};

const ProposalsPage = ({ proposals, leads, userOptions = DEFAULT_USER_OPTIONS, onAddProposal, onEditProposal, onDeleteProposal, onStatusChange, onSendProposal, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [viewProposal, setViewProposal] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [loading, setLoading] = useState(false);
  const defaultUser = firstUserValue(userOptions);
  const [formData, setFormData] = useState({ lead: "", subject: "", sentBy: defaultUser, value: "", status: "Draft", dueDate: "", cc: "", bcc: "", body: "" });
  const [editingId, setEditingId] = useState(null);
  const findLeadByName = (leadName) => {
    const name = cleanText(leadName, "").toLowerCase();
    if (!name) return null;
    return leads.find((lead) => cleanText(lead.name, "").toLowerCase() === name) || null;
  };
  const getLeadValueByName = (leadName) => parseCurrencyValue(findLeadByName(leadName)?.value);
  const getEffectiveProposalValue = (proposal) => {
    const proposalValue = parseCurrencyValue(proposal?.value);
    return proposalValue || getLeadValueByName(proposal?.lead || proposal?.lead_name);
  };
  const applyProposalTemplate = (nextData, force = false) => {
    const shouldUpdateBody = force || isStandardProposalBody(nextData.body);
    const subject = nextData.subject || (nextData.lead ? `Quotation: ${nextData.lead}` : 'Quotation');
    const linkedLeadValue = getLeadValueByName(nextData.lead);
    const enteredValue = parseCurrencyValue(nextData.value);
    const effectiveValue = enteredValue || linkedLeadValue;
    const value = effectiveValue ? String(effectiveValue) : (nextData.value || "");
    return {
      ...nextData,
      value,
      subject,
      body: shouldUpdateBody ? buildStandardProposalBody({ leadName: nextData.lead, value, dueDate: nextData.dueDate }) : nextData.body,
    };
  };
  const openCreateProposal = () => {
    setFormData(applyProposalTemplate({ lead: "", subject: "", sentBy: defaultUser, value: "", status: "Draft", dueDate: "", cc: "", bcc: "", body: "", items: [{brand:"Tungaloy",product:"",description:"",qty:1,unit:"Nos",unitPrice:"",discount:0,gst:18}], paymentTerms: "", poAttachment: null }, true));
    setEditingId(null);
    setShowModal(true);
  };
  const openEditProposal = (p) => {
    const leadName = p.lead || p.lead_name || "";
    const nextData = { lead: leadName, subject: p.subject, sentBy: p.sentBy || p.sent_by, value: getEffectiveProposalValue(p) || "", status: p.status, dueDate: p.dueDate || p.due_date || "", cc: p.cc || "", bcc: p.bcc || "", body: p.body || "", items: Array.isArray(p.quotation_items) ? p.quotation_items : [], paymentTerms: p.payment_terms || "", poAttachment: p.po_attachment || null };
    setFormData(applyProposalTemplate(nextData));
    setEditingId(p.id);
    setShowModal(true);
  };
  const filtered = useMemo(() =>
    proposals.filter(p => {
      const q = searchTerm.toLowerCase();
      const match = !q || [p.lead, p.lead_name, p.subject, p.sentBy, p.sent_by].some(v => (v || "").toLowerCase().includes(q));
      return match && (!filterStatus || p.status === filterStatus) && (!filterAssigned || p.sentBy === filterAssigned);
    }), [proposals, searchTerm, filterStatus, filterAssigned]);

  const totalValue = filtered.reduce((s, p) => s + getEffectiveProposalValue(p), 0);
  const acceptedValue = filtered.filter(p => p.status === "Accepted").reduce((s, p) => s + getEffectiveProposalValue(p), 0);
  const pendingValue = filtered.filter(p => ["Sent", "Viewed"].includes(p.status)).reduce((s, p) => s + getEffectiveProposalValue(p), 0);
  const proposalLeadOptions = useMemo(() => leads.filter((lead) => lead?.stage === "Proposal"), [leads]);

 const handleSave = async () => {
    if (!formData.lead || !formData.subject) { alert("Lead and Subject are required"); return; }
    setLoading(true);
    try {
      const templated = applyProposalTemplate(formData, true);
      const payload = { ...templated, value: parseCurrencyValue(templated.value), items: templated.items || [], paymentTerms: templated.paymentTerms || "" };
      if (editingId) { await onEditProposal(editingId, payload); }
      else { await onAddProposal(payload); }
      setShowModal(false);
      setFormData({ lead: "", subject: "", sentBy: defaultUser, value: "", status: "Draft", dueDate: "", cc: "", bcc: "", body: "" });
      setEditingId(null);
      onRefresh();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this proposal?")) return;
    setLoading(true);
    try { await onDeleteProposal(id); onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (id, status) => {
    setLoading(true);
    try { await onStatusChange(id, status); onRefresh(); }
    catch (err) { alert("Error updating status: " + err.message); }
    finally { setLoading(false); }
  };

  const handleSend = async (id) => {
    if (!window.confirm("Send this proposal to the lead's email?")) return;
    setLoading(true);
    try { await onSendProposal(id); onRefresh(); alert("Proposal sent!"); }
    catch (err) { alert("Error sending: " + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Proposals</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Manage sales proposals and templates</p>
        </div>
        <Button icon={Plus} onClick={openCreateProposal}>Create Proposal</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[["Total Value", totalValue, COLORS.primary], ["Accepted", acceptedValue, COLORS.success], ["Pending", pendingValue, COLORS.warning]].map(([label, val, color]) => (
          <div key={label} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{formatCurrency(val)}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 200, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <FilterGroup label="Status">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 140 }}>
            <option value="">All</option>{PROPOSAL_STATUS.map(o => <option key={o}>{o}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup label="Sent By">
          <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="">All</option>{userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FilterGroup>
        <button onClick={() => { setFilterStatus(""); setFilterAssigned(""); setSearchTerm(""); }} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
      </FilterBar>

      <TableCard title="All Proposals" count={filtered.length}
onExport={() => exportCSV([["Lead", "Subject", "Value", "Status", "Sent By", "Due Date"], ...filtered.map(p => [p.lead||p.lead_name, p.subject, p.value, p.status, p.sentBy||p.sent_by, p.dueDate||p.due_date||"-"])], "proposals.csv")}>        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Lead", "Subject", "Value", "Status", "Due Date", "Sent By", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={7} /> :
              filtered.map(p => (
                <tr key={p.id}>
                  <Td style={{ fontWeight: 600 }}>{p.lead || p.lead_name}</Td>
                  <Td>{p.subject}</Td>
                  <Td style={{ fontWeight: 700 }}>{formatCurrency(getEffectiveProposalValue(p))}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
<Td style={{ fontSize: 12, color: COLORS.neutral }}>{formatDate(p.dueDate || p.due_date)}</Td>
                  <Td>{cleanText(p.sentBy || p.sent_by)}</Td>
                <Td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setViewProposal(p)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.secondary, padding: "4px 6px" }} title="View"><Eye size={15} /></button>
                      {p.status === "Draft" && <button onClick={() => handleSend(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.primary, padding: "4px 6px" }} title="Send"><Mail size={15} /></button>}
                      <button onClick={() => openEditProposal(p)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.warning, padding: "4px 6px" }} title="Edit"><Edit2 size={15} /></button>
                      {p.status === "Sent" && <button onClick={() => handleStatusChange(p.id, "Accepted")} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.success, padding: "4px 6px" }} title="Accept"><CheckCircle2 size={15} /></button>}
                      {p.status === "Sent" && <button onClick={() => handleStatusChange(p.id, "Rejected")} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: "4px 6px" }} title="Reject"><X size={15} /></button>}
                      <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: "4px 6px" }} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableCard>

      <Modal title={editingId ? "Edit Proposal" : "Create Proposal"} open={showModal} onClose={() => { setShowModal(false); setFormData({ lead: "", subject: "", sentBy: defaultUser, value: "", status: "Draft", dueDate: "", cc: "", bcc: "", body: "" }); setEditingId(null); }} maxWidth={850}>
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Customer/Lead *</label>
            <input list="propLeads" value={formData.lead} onChange={e => setFormData(applyProposalTemplate({ ...formData, lead: e.target.value, subject: e.target.value ? `Quotation: ${e.target.value}` : "" }, true))} style={inputStyle} placeholder="Type or select a Proposal stage lead" />
            <datalist id="propLeads">{proposalLeadOptions.map(l => <option key={l.id} value={l.name} />)}</datalist>
          </div>
          <div>
            <label style={labelStyle}>Subject *</label>
            <input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} style={inputStyle} placeholder="Proposal subject" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>CC (comma separated)</label>
              <input value={formData.cc || ""} onChange={e => setFormData({ ...formData, cc: e.target.value })} style={inputStyle} placeholder="email@example.com" />
            </div>
            <div>
              <label style={labelStyle}>BCC (comma separated)</label>
              <input value={formData.bcc || ""} onChange={e => setFormData({ ...formData, bcc: e.target.value })} style={inputStyle} placeholder="email@example.com" />
            </div>
          </div>
         <div>
            <label style={labelStyle}>Quotation Items</label><div style={{display:'grid',gap:6,marginBottom:8}}>{(formData.items || [{brand:'Tungaloy',product:'',description:'',qty:1,unit:'Nos',unitPrice:'',discount:0,gst:18}]).map((it,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.4fr 70px 70px 100px 80px 70px',gap:5}}>{[['Brand','brand'],['Product / Item','product'],['Specification','description'],['Qty','qty'],['Unit','unit'],['Unit Price','unitPrice'],['Discount %','discount'],['GST %','gst']].map(([label,key])=><input key={key} aria-label={label+' '+(i+1)} type={['qty','unitPrice','discount','gst'].includes(key)?'number':'text'} min={['qty','unitPrice','discount','gst'].includes(key)?0:undefined} value={it[key] ?? ''} placeholder={label} onChange={e=>{const items=[...(formData.items||[])];items[i]={...items[i],[key]:e.target.value};setFormData({...formData,items});}} style={{...inputStyle,padding:7}} />)}</div>)}</div><Button size="sm" variant="secondary" onClick={()=>setFormData({...formData,items:[...(formData.items||[]),{brand:'',product:'',description:'',qty:1,unit:'Nos',unitPrice:'',discount:0,gst:18}]})}>Add quotation item</Button><div style={{marginTop:14}}><label style={labelStyle}>Payment Terms</label><input value={formData.paymentTerms || ''} onChange={e=>setFormData({...formData,paymentTerms:e.target.value})} style={inputStyle} placeholder="30% advance, balance before dispatch / credit terms" /></div><div style={{marginTop:12}}><label style={labelStyle}>PO Attachment (PDF)</label><input aria-label="PO Attachment" type="file" accept="application/pdf" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.type!=="application/pdf"||f.size>2*1024*1024)return alert("Choose a PDF up to 2 MB");const reader=new FileReader();reader.onload=()=>setFormData({...formData,poAttachment:{name:f.name,data:reader.result}});reader.readAsDataURL(f);}} style={inputStyle}/></div><div style={{fontSize:12,color:COLORS.neutral}}>Grand total (including GST): {formatCurrency((formData.items||[]).reduce((sum,item)=>{const base=Number(item.qty||0)*Number(item.unitPrice||0);const taxable=base-base*Number(item.discount||0)/100;return sum+taxable+taxable*Number(item.gst||0)/100;},0))}</div><label style={labelStyle}>Email Body</label>
            <RichTextEditor value={formData.body} onChange={html => setFormData({ ...formData, body: html })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Value (INR)</label>
              <input type="number" value={formData.value} onChange={e => setFormData(applyProposalTemplate({ ...formData, value: e.target.value }))} style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Sent By</label>
              <select value={formData.sentBy} onChange={e => setFormData({ ...formData, sentBy: e.target.value })} style={inputStyle}>
                {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={formData.dueDate} onChange={e => setFormData(applyProposalTemplate({ ...formData, dueDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} style={inputStyle}>
                {PROPOSAL_STATUS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
         <Button variant="secondary" onClick={() => { setShowModal(false); setEditingId(null); }} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{editingId ? "Update" : "Create"}</Button>
        </div>
      </Modal>

      <Modal title="Proposal Details" open={!!viewProposal} onClose={() => setViewProposal(null)} maxWidth={700}>
        {viewProposal && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 20 }}>
              {[["Lead", viewProposal.lead || viewProposal.lead_name || "-"], ["Subject", viewProposal.subject], ["Value", formatCurrency(getEffectiveProposalValue(viewProposal))], ["Status", viewProposal.status], ["Due Date", formatDate(viewProposal.dueDate || viewProposal.due_date)], ["Sent By", viewProposal.sentBy || viewProposal.sent_by || "-"], ["CC", viewProposal.cc || "-"], ["BCC", viewProposal.bcc || "-"]].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: COLORS.neutral, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>
            {viewProposal.body && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: COLORS.neutral, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Email Body</div>
                <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: viewProposal.body }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setViewProposal(null)}>Close</Button>
              <Button onClick={() => { setViewProposal(null); openEditProposal(viewProposal); }}>Edit</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ENHANCED CONTACTS PAGE
// ---------------------------------------------------------------------------
const ContactsPage = ({ contacts, leads, onAddContact, onDeleteContact, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", mobile: "", department: "",
    designation: "User", linkedLead: "", active: true, phone: "", altPhone: "",
    lifeStage: "Lead", salesCommission: ""
  });

 const filtered = useMemo(() =>
    contacts.filter(c => {
      const q = searchTerm.toLowerCase();
      return !q || [c.firstName, c.first_name, c.lastName, c.last_name, c.email, c.mobile, c.linkedLead, c.linked_lead].some(v => (v || "").toLowerCase().includes(q));
    }), [contacts, searchTerm]);

  const handleSave = async () => {
    if (!formData.email) { alert("Email is required"); return; }
    setLoading(true);
    try {
      await onAddContact(formData);
      setShowModal(false);
      setFormData({ firstName: "", lastName: "", email: "", mobile: "", department: "", designation: "User", linkedLead: "", active: true, phone: "", altPhone: "", lifeStage: "Lead", salesCommission: "" });
      onRefresh();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this contact?")) return;
    setLoading(true);
    try { await onDeleteContact(id); onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Contacts Management</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Customer contacts and stakeholders - {filtered.length} records</p>
        </div>
        <Button icon={Plus} onClick={() => setShowModal(true)}>Add Contact</Button>
      </div>

      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search contacts..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 220, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <button onClick={() => setSearchTerm("")} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
      </FilterBar>

      <TableCard title="All Contacts" count={filtered.length}
        onExport={() => exportCSV([["First Name", "Last Name", "Email", "Mobile", "Phone", "Department", "Designation", "Linked Lead", "Life Stage", "Status"], ...filtered.map(c => [c.firstName||c.first_name, c.lastName||c.last_name, c.email, c.mobile, c.phone||"-", c.department||"-", c.designation||"-", c.linkedLead||c.linked_lead||"-", c.lifeStage||c.life_stage||"-", c.active||c.is_active ? "Active" : "Inactive"])], "contacts.csv")}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Name", "Email", "Mobile", "Department", "Designation", "Linked Lead", "Life Stage", "Status", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={9} /> :
              filtered.map(c => (
                <tr key={c.id}>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={`${c.firstName || c.first_name} ${c.lastName || c.last_name}`} size={32} />
                      <span style={{ fontWeight: 600 }}>{c.firstName || c.first_name} {c.lastName || c.last_name}</span>
                    </div>
                  </Td>
                  <Td style={{ color: COLORS.secondary }}>{c.email}</Td>
                  <Td>{cleanText(c.mobile)}</Td>
                  <Td>{cleanText(c.department)}</Td>
                  <Td><span style={{ padding: "3px 8px", borderRadius: 6, background: COLORS.bg, fontSize: 11, fontWeight: 600 }}>{c.designation || "User"}</span></Td>
                 <Td>{cleanText(c.linkedLead || c.linked_lead)}</Td>
                  <Td>{cleanText(c.lifeStage || c.life_stage)}</Td>
                  <Td><StatusBadge status={c.active || c.is_active ? "Active" : "Inactive"} /></Td>
                  <Td><button onClick={() => handleDelete(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: "4px 6px" }} title="Delete"><Trash2 size={15} /></button></Td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableCard>

      <Modal title="Add Contact" open={showModal} onClose={() => setShowModal(false)} maxWidth={800}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${COLORS.border}` }}>
            Contact Information
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            {[["First Name *", "firstName"], ["Last Name", "lastName"], ["Email *", "email"], ["Department", "department"]].map(([lbl, key]) => (
              <div key={key}>
                <label style={labelStyle}>{lbl}</label>
                <input value={formData[key]} onChange={e => setFormData({ ...formData, [key]: e.target.value })} style={inputStyle} />
              </div>
            ))}
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${COLORS.border}` }}>
            Contact Numbers
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Mobile *</label>
              <input value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value })} style={inputStyle} type="tel" />
            </div>
            <div>
              <label style={labelStyle}>Alternate Number</label>
              <input value={formData.altPhone || ""} onChange={e => setFormData({ ...formData, altPhone: e.target.value })} style={inputStyle} type="tel" />
            </div>
            <div>
              <label style={labelStyle}>Landline</label>
              <input value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={inputStyle} type="tel" />
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${COLORS.border}` }}>
            Additional Details
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Designation</label>
              <select value={formData.designation} onChange={e => setFormData({ ...formData, designation: e.target.value })} style={inputStyle}>
                {CONTACT_DESIGNATIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Life Stage</label>
              <select value={formData.lifeStage || "Lead"} onChange={e => setFormData({ ...formData, lifeStage: e.target.value })} style={inputStyle}>
                {LIFE_STAGES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Link to Lead (Optional)</label>
              <input list="contactLeads" value={formData.linkedLead} onChange={e => setFormData({ ...formData, linkedLead: e.target.value })} style={inputStyle} placeholder="Select or type" />
              <datalist id="contactLeads">{leads.map(l => <option key={l.id} value={l.name} />)}</datalist>
            </div>
            <div>
              <label style={labelStyle}>Sales Commission (%)</label>
              <input type="number" value={formData.salesCommission || ""} onChange={e => setFormData({ ...formData, salesCommission: e.target.value })} style={inputStyle} placeholder="0" />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <input type="checkbox" id="activeCheck" checked={formData.active} onChange={e => setFormData({ ...formData, active: e.target.checked })} />
            <label htmlFor="activeCheck" style={{ fontSize: 13, fontWeight: 500 }}>Active</label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>Save</Button>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ENHANCED CAMPAIGNS PAGE
// ---------------------------------------------------------------------------
const CampaignsPage = ({ campaigns, leads, userOptions = DEFAULT_USER_OPTIONS, onAddCampaign, onDeleteCampaign, onSendCampaign, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const defaultUser = firstUserValue(userOptions);
  const emptyForm = { name: "", type: "Email", status: "Draft", createdBy: defaultUser, recipients: "", recipientGroup: "all", subject: "", body: "", cc: "" };
  const [formData, setFormData] = useState(emptyForm);

  const recipientGroups = [
    { value: "all", label: "All leads with email" },
    { value: "new", label: "New leads" },
    { value: "proposal", label: "Proposal stage leads" },
    { value: "won", label: "Won / customers" },
  ];

  const campaignRecipients = useMemo(() => {
    const seen = new Set();
    return leads.filter((lead) => {
      const email = String(lead.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      const stage = String(lead.stage || "").toLowerCase();
      const status = String(lead.status || "").toLowerCase();
      const group = formData.recipientGroup;
      const matchesGroup =
        group === "all" ||
        (group === "new" && stage === "new") ||
        (group === "proposal" && stage === "proposal") ||
        (group === "won" && (stage === "won" || status === "customer"));
      if (!matchesGroup) return false;
      seen.add(email);
      return true;
    });
  }, [leads, formData.recipientGroup]);

  const filtered = useMemo(() =>
    campaigns.filter(c => {
      const q = searchTerm.toLowerCase();
      return !q || [c.name, c.type, c.status, c.subject, c.createdBy, c.created_by].some(v => (v || "").toLowerCase().includes(q));
    }), [campaigns, searchTerm]);

  const resetForm = () => setFormData({ ...emptyForm, createdBy: defaultUser });

  const validateCampaign = () => {
    if (!formData.name.trim()) return "Campaign name is required";
    if (formData.type === "Email") {
      if (!formData.subject.trim()) return "Email subject is required";
      if (!String(formData.body || "").trim()) return "Email body is required";
      if (campaignRecipients.length === 0) return "No lead email addresses found for this recipient group";
    }
    return "";
  };

  const handleSave = async (sendNow = false) => {
    const error = validateCampaign();
    if (error) { alert(error); return; }
    setLoading(true);
    try {
      const res = await onAddCampaign({ ...formData, recipients: campaignRecipients.length });
      if (sendNow && formData.type === "Email") {
        const sent = await onSendCampaign(res.campaign.id, { recipientGroup: formData.recipientGroup });
        alert("Campaign sent to " + (sent.campaign?.recipients || campaignRecipients.length) + " email recipient(s).");
      }
      setShowModal(false);
      resetForm();
      await onRefresh();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleSend = async (campaign) => {
    if (campaign.type !== "Email") {
      alert("Only Email campaigns can be sent from this page.");
      return;
    }
    if (!window.confirm("Send this campaign to all leads with email addresses?")) return;
    setLoading(true);
    try {
      const res = await onSendCampaign(campaign.id, { recipientGroup: "all" });
      alert("Campaign sent to " + (res.campaign?.recipients || 0) + " email recipient(s).");
      await onRefresh();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this campaign?")) return;
    setLoading(true);
    try { await onDeleteCampaign(id); await onRefresh(); }
    catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Campaigns</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Marketing campaigns linked to leads - {filtered.length} records</p>
        </div>
        <Button icon={Plus} onClick={() => { resetForm(); setShowModal(true); }}>Create Campaign</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[["Total", campaigns.length, COLORS.primary], ["Active", campaigns.filter(c => c.status === "Active").length, COLORS.success], ["Draft", campaigns.filter(c => c.status === "Draft").length, COLORS.neutral]].map(([label, val, color]) => (
          <div key={label} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      <TableCard title="All Campaigns" count={filtered.length} searchVal={searchTerm} onSearch={setSearchTerm}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Name", "Type", "Status", "Created By", "Recipients", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={6} /> :
              filtered.map(c => (
                <tr key={c.id}>
                  <Td style={{ fontWeight: 600 }}>{c.name}</Td>
                  <Td><StatusBadge status={c.type} /></Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>{c.createdBy || c.created_by || "-"}</Td>
                  <Td>{c.recipients || 0}</Td>
                  <Td>
                    <button onClick={() => handleSend(c)} disabled={loading || c.type !== "Email"} style={{ background: "none", border: "none", cursor: c.type === "Email" ? "pointer" : "not-allowed", color: COLORS.success, padding: "4px 6px" }} title="Send email campaign"><Mail size={15} /></button>
                    <button onClick={() => handleDelete(c.id)} disabled={loading} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.danger, padding: "4px 6px" }} title="Delete"><Trash2 size={15} /></button>
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableCard>

      <Modal title="Create Campaign" open={showModal} onClose={() => { if (!loading) setShowModal(false); }} maxWidth={850}>
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Campaign Name *</label>
            <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} style={inputStyle}>
                {["Email", "SMS", "Social Media", "WhatsApp"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} style={inputStyle}>
                {["Draft", "Active", "Inactive", "Completed"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Created By</label>
              <select value={formData.createdBy} onChange={e => setFormData({ ...formData, createdBy: e.target.value })} style={inputStyle}>
                {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Recipients</label>
              <select value={formData.recipientGroup} onChange={e => setFormData({ ...formData, recipientGroup: e.target.value })} style={inputStyle}>
                {recipientGroups.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: campaignRecipients.length ? COLORS.success : COLORS.danger, marginTop: 6 }}>
                {campaignRecipients.length} email recipient(s) ready
              </div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Subject</label>
            <input value={formData.subject || ""} onChange={e => setFormData({ ...formData, subject: e.target.value })} style={inputStyle} placeholder="Email subject" />
          </div>
          <div>
            <label style={labelStyle}>CC (comma separated)</label>
            <input value={formData.cc || ""} onChange={e => setFormData({ ...formData, cc: e.target.value })} style={inputStyle} placeholder="email@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Email Body</label>
            <RichTextEditor value={formData.body} onChange={html => setFormData({ ...formData, body: html })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={loading}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={loading}>Save Draft</Button>
          <Button icon={Mail} onClick={() => handleSave(true)} disabled={loading || formData.type !== "Email"}>{loading ? "Sending..." : "Create & Send"}</Button>
        </div>
      </Modal>
    </div>
  );
};


// ---------------------------------------------------------------------------
// PAYMENT REMINDERS PAGE
// ---------------------------------------------------------------------------
const PaymentRemindersPage = ({ paymentReminders, onUpdatePaymentReminder, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  const filtered = useMemo(() => paymentReminders.filter((item) => {
    const q = searchTerm.toLowerCase();
    const textMatch = !q || [item.customer_name, item.lead_name, item.company, item.email, item.phone, item.assigned]
      .some((value) => String(value || "").toLowerCase().includes(q));
    return textMatch && (!stageFilter || item.current_stage === stageFilter);
  }), [paymentReminders, searchTerm, stageFilter]);

  const stageCounts = PAYMENT_REMINDER_STAGES.map((stage) => ({
    stage,
    count: paymentReminders.filter((item) => item.current_stage === stage).length,
  }));

  const updateStage = async (item, stage) => {
    setLoadingId(item.id);
    try {
      await onUpdatePaymentReminder(item.id, { ...item, currentStage: stage, status: stage === "Payment Received" ? "Completed" : item.status });
      await onRefresh();
    } catch (err) { alert("Error updating payment reminder: " + err.message); }
    finally { setLoadingId(null); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Payment Tracking</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Proposal accepted → record advance, partial, credit and balance payments independently</p>
        </div>
        <Button variant="secondary" icon={CheckCircle2} onClick={onRefresh}>Refresh</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {stageCounts.map(({ stage, count }) => (
          <div key={stage} onClick={() => setStageFilter(stageFilter === stage ? "" : stage)} style={{ background: COLORS.bgCard, border: `1px solid ${stageFilter === stage ? COLORS.primary : COLORS.border}`, borderLeft: `4px solid ${stage === "Payment Received" ? COLORS.success : COLORS.warning}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
            <div style={{ fontSize: 11, color: COLORS.neutral, fontWeight: 700, textTransform: "uppercase" }}>{stage}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: stage === "Payment Received" ? COLORS.success : COLORS.warning, marginTop: 4 }}>{count}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search payments..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 240, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <FilterGroup label="Stage">
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">All</option>{PAYMENT_REMINDER_STAGES.map(stage => <option key={stage}>{stage}</option>)}
          </select>
        </FilterGroup>
        <button onClick={() => { setSearchTerm(""); setStageFilter(""); }} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
      </FilterBar>

      <TableCard title="Payment Reminders" count={filtered.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Customer", "Company", "Invoice / Order", "Total", "Paid", "Balance", "Due Date", "Payment Status", "Assigned To", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={9} /> : filtered.map((item) => {
              const currentIndex = PAYMENT_REMINDER_STAGES.indexOf(item.current_stage);
              const nextStage = null;
              return (
                <tr key={item.id}>
                  <Td><span style={{ fontWeight: 700 }}>{cleanText(item.customer_name || item.lead_name)}</span></Td>
                  <Td>{cleanText(item.company)}</Td>
                  <Td style={{ color: COLORS.secondary }}>{cleanText(item.email)}</Td>
                  <Td>{item.invoice_number || item.order_number || "-"}</Td>
                  <Td style={{ fontWeight: 700 }}>{formatCurrency(item.amount)}</Td>
                  <Td>{formatCurrency(item.paid_amount || 0)}</Td>
                  <Td>{formatCurrency(item.balance_amount ?? Math.max(Number(item.amount||0)-Number(item.paid_amount||0),0))}</Td>
                  <Td>
                    <select value={item.current_stage} onChange={(e) => updateStage(item, e.target.value)} style={{ ...inputStyle, minWidth: 210 }} disabled={loadingId === item.id}>
                      {PAYMENT_REMINDER_STAGES.map(stage => <option key={stage}>{stage}</option>)}
                    </select>
                  </Td>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.assigned} size={28} /><span style={{ fontSize: 12, color: COLORS.neutral }}>{cleanText(item.assigned)}</span></div></Td>
                  <Td>{formatDate(item.due_date)}</Td>
                  <Td><StatusBadge status={item.status || "Pending"} /></Td>
                  <Td><Button size="sm" onClick={() => { const value=window.prompt("Payment amount received (INR)", ""); if(value!==null) onUpdatePaymentReminder(item.id,{paymentAmount:value,paymentNote:"Payment recorded"}).then(onRefresh).catch(e=>alert(e.message)); }}>Record Payment</Button> <Button size="sm" variant="secondary" onClick={() => window.alert((item.payment_history||[]).map(h=>`${h.date}: ${h.amount} - ${h.note||""}`).join("\n") || "No payment history")}>View History</Button> <Button size="sm" variant="secondary" onClick={() => crmAPI.sendPaymentReminder(item.id).then(()=>window.alert("Payment reminder sent.")).catch(e=>window.alert(e.message))}>Send Reminder</Button></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CUSTOMER SUCCESS PAGE
// ---------------------------------------------------------------------------
const ConsumablesPanel = ({ items, machines, userOptions, canAdd, canEdit, canDelete, onSave, onDelete }) => {
  const defaultAssigned = firstUserValue(userOptions);
  const empty = { machineId:"", leadId:"", customerName:"", itemName:"", sku:"", brand:"", specification:"", category:"PP Strap Roll", supplyType:"Sale", quantity:"", lastSuppliedQuantity:"", unit:"Rolls", reorderLevel:"", lastSuppliedDate:"", consumptionFrequency:"Monthly", frequencyDays:30, nextRequirementDate:"", purchaseCost:"", unitPrice:"", taxPercent:18, orderInvoiceNumber:"", assigned:defaultAssigned, assignedUserId:userIdForValue(userOptions,defaultAssigned), opportunityStatus:"Reminder Due", customerContactName:"", customerContactPhone:"", status:"Active", notes:"" };
  const [open,setOpen]=useState(false); const [editing,setEditing]=useState(null); const [form,setForm]=useState(empty);
  const openForm=(item=null)=>{setEditing(item?.id||null);setForm(item?{machineId:item.machine_id||"",leadId:item.lead_id||"",customerName:item.customer_name||"",itemName:item.item_name||"",sku:item.sku||"",brand:item.brand||"",specification:item.specification||"",category:item.category||"Consumable",supplyType:item.supply_type||"Sale",quantity:item.quantity||"",lastSuppliedQuantity:item.last_supplied_quantity||"",unit:item.unit||"Nos",reorderLevel:item.reorder_level||"",lastSuppliedDate:String(item.last_supplied_date||"").slice(0,10),consumptionFrequency:item.consumption_frequency||"Monthly",frequencyDays:item.frequency_days||30,nextRequirementDate:String(item.next_requirement_date||"").slice(0,10),purchaseCost:item.purchase_cost||"",unitPrice:item.unit_price||"",taxPercent:item.tax_percent??18,orderInvoiceNumber:item.order_invoice_number||"",assigned:item.assigned||defaultAssigned,assignedUserId:item.assigned_user_id||userIdForValue(userOptions,item.assigned),opportunityStatus:item.opportunity_status||"Reminder Due",customerContactName:item.customer_contact_name||"",customerContactPhone:item.customer_contact_phone||"",status:item.status||"Active",notes:item.notes||""}:{...empty});setOpen(true);};
  const chooseMachine=(id)=>{const m=machines.find(x=>String(x.id)===String(id));setForm({...form,machineId:id,leadId:m?.lead_id||"",customerName:m?.customer_name||"",assigned:m?.assigned||form.assigned,assignedUserId:m?.assigned_user_id||form.assignedUserId});};
  return <div style={{marginTop:24}}><TableCard title="Consumables & Repeat Supply" count={items.length}><div style={{padding:12,display:"flex",justifyContent:"flex-end"}}>{canAdd&&<Button icon={Plus} onClick={()=>openForm()}>Add Consumable</Button>}</div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><Th>Customer</Th><Th>Item</Th><Th>Category</Th><Th>Quantity</Th><Th>Reorder Level</Th><Th>Next Requirement</Th><Th>Value</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>{items.map(i=><tr key={i.id}><Td>{i.customer_name}</Td><Td>{i.item_name}</Td><Td>{i.category}</Td><Td>{i.quantity} {i.unit}</Td><Td>{i.reorder_level} {i.unit}</Td><Td>{formatDate(i.next_requirement_date)}</Td><Td>{formatCurrency(Number(i.quantity||0)*Number(i.unit_price||0))}</Td><Td><StatusBadge status={i.status}/></Td><Td><div style={{display:"flex",gap:6}}>{canEdit&&<Button size="sm" variant="secondary" onClick={()=>openForm(i)}>Edit</Button>}{canDelete&&<Button size="sm" variant="danger" onClick={()=>window.confirm("Delete this consumable record?")&&onDelete(i.id)}>Delete</Button>}</div></Td></tr>)}</tbody></table></TableCard>
  <Modal title={editing?"Edit Consumable":"Add Consumable"} open={open} onClose={()=>setOpen(false)}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><FormField label="Installed Machine"><select value={form.machineId} onChange={e=>chooseMachine(e.target.value)} style={inputStyle}><option value="">Select machine</option>{machines.map(m=><option key={m.id} value={m.id}>{m.customer_name} — {m.machine_model}</option>)}</select></FormField>{[["Customer *","customerName","text"],["Item *","itemName","text"],["Category","category","text"],["Quantity","quantity","number"],["Unit","unit","text"],["Reorder Level","reorderLevel","number"],["Last Supplied","lastSuppliedDate","date"],["Next Requirement","nextRequirementDate","date"],["Unit Price","unitPrice","number"]].map(([l,k,t])=><FormField key={k} label={l}><input type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={inputStyle}/></FormField>)}</div><FormField label="Notes"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inputStyle}/></FormField><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={async()=>{if(!form.customerName||!form.itemName)return alert("Customer and item are required.");await onSave(editing,form);setOpen(false);}}>Save</Button></div></Modal></div>;
};

const ReplacementPanel = ({ items, machines, userOptions, canAdd, canEdit, canDelete, onSave, onDelete }) => {
  const empty={machineId:"",leadId:"",customerName:"",currentModel:"",replacementReason:"",proposedModel:"",expectedPurchaseDate:"",estimatedValue:"",stage:"New",assigned:firstUserValue(userOptions),assignedUserId:userIdForValue(userOptions,firstUserValue(userOptions)),status:"Open",notes:""};
  const [open,setOpen]=useState(false);const [editing,setEditing]=useState(null);const [form,setForm]=useState(empty);
  const openForm=(i=null)=>{setEditing(i?.id||null);setForm(i?{machineId:i.machine_id||"",leadId:i.lead_id||"",customerName:i.customer_name||"",currentModel:i.current_model||"",replacementReason:i.replacement_reason||"",proposedModel:i.proposed_model||"",expectedPurchaseDate:String(i.expected_purchase_date||"").slice(0,10),estimatedValue:i.estimated_value||"",stage:i.stage||"New",assigned:i.assigned||firstUserValue(userOptions),assignedUserId:i.assigned_user_id||null,status:i.status||"Open",notes:i.notes||""}:empty);setOpen(true);};
  const chooseMachine=(id)=>{const m=machines.find(x=>String(x.id)===String(id));setForm({...form,machineId:id,leadId:m?.lead_id||"",customerName:m?.customer_name||"",currentModel:m?.machine_model||"",assigned:m?.assigned||form.assigned,assignedUserId:m?.assigned_user_id||form.assignedUserId});};
  return <div style={{marginTop:24}}><TableCard title="Machine Replacement Opportunities" count={items.length}><div style={{padding:12,display:"flex",justifyContent:"flex-end"}}>{canAdd&&<Button icon={Plus} onClick={()=>openForm()}>Add Opportunity</Button>}</div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><Th>Customer</Th><Th>Current Machine</Th><Th>Proposed Machine</Th><Th>Reason</Th><Th>Expected Date</Th><Th>Value</Th><Th>Stage</Th><Th>Assigned</Th><Th>Action</Th></tr></thead><tbody>{items.map(i=><tr key={i.id}><Td>{i.customer_name}</Td><Td>{i.current_model||"-"}</Td><Td>{i.proposed_model||"-"}</Td><Td>{i.replacement_reason||"-"}</Td><Td>{formatDate(i.expected_purchase_date)}</Td><Td>{formatCurrency(i.estimated_value)}</Td><Td><StatusBadge status={i.stage}/></Td><Td>{i.assigned||"-"}</Td><Td><div style={{display:"flex",gap:6}}>{canEdit&&<Button size="sm" variant="secondary" onClick={()=>openForm(i)}>Edit</Button>}{canDelete&&<Button size="sm" variant="danger" onClick={()=>window.confirm("Delete this opportunity?")&&onDelete(i.id)}>Delete</Button>}</div></Td></tr>)}</tbody></table></TableCard><Modal title={editing?"Edit Replacement Opportunity":"Add Replacement Opportunity"} open={open} onClose={()=>setOpen(false)}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><FormField label="Installed Machine"><select value={form.machineId} onChange={e=>chooseMachine(e.target.value)} style={inputStyle}><option value="">Select machine</option>{machines.map(m=><option key={m.id} value={m.id}>{m.customer_name} — {m.machine_model}</option>)}</select></FormField>{[["Customer *","customerName","text"],["Current Model","currentModel","text"],["Replacement Reason","replacementReason","text"],["Proposed Model","proposedModel","text"],["Expected Purchase Date","expectedPurchaseDate","date"],["Estimated Value","estimatedValue","number"]].map(([l,k,t])=><FormField key={k} label={l}><input type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={inputStyle}/></FormField>)}<FormField label="Stage"><select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})} style={inputStyle}>{LEAD_STAGES.map(v=><option key={v}>{v}</option>)}</select></FormField><FormField label="Assigned Executive"><select value={form.assigned} onChange={e=>setForm({...form,assigned:e.target.value,assignedUserId:userIdForValue(userOptions,e.target.value)})} style={inputStyle}>{userOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></FormField></div><FormField label="Notes"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inputStyle}/></FormField><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={async()=>{if(!form.customerName)return alert("Customer is required.");await onSave(editing,form);setOpen(false);}}>Save</Button></div></Modal></div>;
};

const MachinesServicePage = ({ machines = [], consumables = [], replacements = [], leads = [], userOptions = DEFAULT_USER_OPTIONS, onSaveMachine, onDeleteMachine, onLoadServices, onAddService, onDeleteService, onSaveConsumable, onDeleteConsumable, onSaveReplacement, onDeleteReplacement }) => {
  const { hasPermission, isAdmin } = usePermissions();
  const canAdd = isAdmin || hasPermission("Machine Service", "Add machine service");
  const canEdit = isAdmin || hasPermission("Machine Service", "Edit machine service");
  const canDelete = isAdmin || hasPermission("Machine Service", "Delete machine service");
  const emptyMachine = { leadId: "", customerName: "", machineModel: "", serialNumber: "", installationDate: "", warrantyStart: "", warrantyEnd: "", nextMaintenance: "", spareRequirement: "", amcStatus: "Not Applicable", amcStart: "", amcEnd: "", location: "", assigned: firstUserValue(userOptions), assignedUserId: userIdForValue(userOptions, firstUserValue(userOptions)), status: "Active", notes: "" };
  const emptyService = { serviceDate: new Date().toISOString().slice(0, 10), serviceType: "Preventive Maintenance", serviceCategory: "Preventive Maintenance", status: "Completed", assignedTechnicianId: "", technician: "", nextServiceDate: "", customerContactName: "", customerContactPhone: "", coverageStatus: "Chargeable", resolutionStatus: "Resolved", laborCost: "", spareCost: "", travelCost: "", downtimeStart: "", downtimeEnd: "", issueReported: "", workPerformed: "", spareUsed: "", customerConfirmationName: "", customerFeedback: "", customerRating: "", notes: "" };
  const [machineModal, setMachineModal] = useState(false);
  const [machineForm, setMachineForm] = useState(emptyMachine);
  const [editingId, setEditingId] = useState(null);
  const [serviceMachine, setServiceMachine] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [serviceFiles, setServiceFiles] = useState([]);
  const [attachmentServiceId, setAttachmentServiceId] = useState(null);
  const [serviceAttachments, setServiceAttachments] = useState([]);
  const emptyServiceFilters = { search: "", dateFrom: "", dateTo: "", category: "", status: "", technician: "", resolution: "" };
  const [serviceFilters, setServiceFilters] = useState(emptyServiceFilters);
  const [search, setSearch] = useState("");

  const filtered = machines.filter((m) => [m.customer_name, m.machine_model, m.serial_number, m.location, m.amc_status].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())));
  const openMachine = (machine = null) => {
    setEditingId(machine?.id || null);
    setMachineForm(machine ? {
      leadId: machine.lead_id || "", customerName: machine.customer_name || "", machineModel: machine.machine_model || "",
      serialNumber: machine.serial_number || "", installationDate: String(machine.installation_date || "").slice(0, 10),
      warrantyStart: String(machine.warranty_start || "").slice(0, 10), warrantyEnd: String(machine.warranty_end || "").slice(0, 10),
      nextMaintenance: String(machine.next_maintenance || "").slice(0, 10), spareRequirement: machine.spare_requirement || "",
      amcStatus: machine.amc_status || "Not Applicable", amcStart: String(machine.amc_start || "").slice(0, 10), amcEnd: String(machine.amc_end || "").slice(0, 10),
      location: machine.location || "", assigned: machine.assigned || firstUserValue(userOptions), assignedUserId: machine.assigned_user_id || null,
      status: machine.status || "Active", notes: machine.notes || "",
    } : emptyMachine);
    setMachineModal(true);
  };
  const selectLead = (leadId) => {
    const lead = leads.find((item) => String(item.id) === String(leadId));
    setMachineForm({ ...machineForm, leadId, customerName: lead?.company || lead?.name || "", location: lead?.installation_location || lead?.location || "", assigned: lead?.assigned || machineForm.assigned, assignedUserId: lead?.assigned_user_id || userIdForValue(userOptions, lead?.assigned) });
  };
  const saveMachine = async () => {
    if (!machineForm.leadId) return alert("Select a customer from Customer Success.");
    if (!machineForm.customerName || !machineForm.machineModel) return alert("Customer and machine model are required.");
    try {
      await onSaveMachine(editingId, machineForm);
      setMachineModal(false);
      alert(editingId ? "Machine updated successfully." : "Machine saved successfully.");
    } catch (err) {
      alert(`Machine could not be saved: ${err.message}`);
    }
  };
  const openServices = async (machine) => { setServiceMachine(machine); setServices(await onLoadServices(machine.id)); setServiceForm(emptyService); setServiceFiles([]); setAttachmentServiceId(null); setServiceAttachments([]); setServiceFilters(emptyServiceFilters); };
  const fileToBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  const saveService = async () => {
    try {
      const item = await onAddService(serviceMachine.id, serviceForm);
      const attachments = serviceFiles.length
        ? await Promise.all(serviceFiles.map(async file => ({ fileName: file.name, mimeType: file.type, base64Data: await fileToBase64(file) })))
        : [buildServiceReportPdf(serviceMachine, serviceForm)];
      for (const attachment of attachments) {
        await crmAPI.createMachineServiceAttachment(item.id, attachment);
      }
      setServices((prev) => [{ ...item, attachment_count: attachments.length }, ...prev]); setServiceForm(emptyService); setServiceFiles([]);
      alert("Service entry saved successfully.");
    } catch (err) { alert(`Service entry could not be saved: ${err.message}`); }
  };
  const showAttachments = async (service) => {
    const result = await crmAPI.fetchMachineServiceAttachments(service.id);
    setAttachmentServiceId(service.id);
    setServiceAttachments(result.attachments || []);
  };
  const filteredServiceHistory = useMemo(() => services.filter((service) => {
    const q = serviceFilters.search.toLowerCase().trim();
    const searchable = [service.issue_reported, service.work_performed, service.spare_used, service.notes, service.customer_contact_name, service.customer_feedback].join(" ").toLowerCase();
    const serviceDate = String(service.service_date || "").slice(0, 10);
    return (!q || searchable.includes(q))
      && (!serviceFilters.dateFrom || serviceDate >= serviceFilters.dateFrom)
      && (!serviceFilters.dateTo || serviceDate <= serviceFilters.dateTo)
      && (!serviceFilters.category || (service.service_category || service.service_type) === serviceFilters.category)
      && (!serviceFilters.status || service.status === serviceFilters.status)
      && (!serviceFilters.technician || String(service.assigned_technician_id || "") === String(serviceFilters.technician))
      && (!serviceFilters.resolution || service.resolution_status === serviceFilters.resolution);
  }), [services, serviceFilters]);
  const field = (label, key, type = "text") => <FormField label={label}><input type={type} value={machineForm[key] || ""} onChange={e => setMachineForm({ ...machineForm, [key]: e.target.value })} style={inputStyle} /></FormField>;
  return <div style={{ padding: 24 }}>
    <PageHeader title="Machines & Service" subtitle="Installed machine base, warranty, AMC, maintenance, spares and service history" action={canAdd && <Button icon={Plus} onClick={() => openMachine()}>Add Machine</Button>} />
    <TableCard title="Installed Machines" count={filtered.length} onSearch={setSearch} searchVal={search} onExport={() => exportCSV([["Customer","Model","Serial Number","Installation","Warranty End","Next Maintenance","AMC","Spares","Status"], ...filtered.map(m => [m.customer_name,m.machine_model,m.serial_number||"-",m.installation_date||"-",m.warranty_end||"-",m.next_maintenance||"-",m.amc_status||"-",m.spare_requirement||"-",m.status])], "installed-machines.csv")}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><Th>Customer</Th><Th>Machine</Th><Th>Serial No.</Th><Th>Installed</Th><Th>Warranty</Th><Th>Next Maintenance</Th><Th>AMC</Th><Th>Services</Th><Th>Action</Th></tr></thead><tbody>
        {filtered.map(m => <tr key={m.id}><Td><strong>{m.customer_name}</strong><br/><span style={{ color: COLORS.neutral }}>{m.location || "-"}</span></Td><Td>{m.machine_model}</Td><Td>{m.serial_number || "-"}</Td><Td>{formatDate(m.installation_date)}</Td><Td>{formatDate(m.warranty_end)}</Td><Td>{formatDate(m.next_maintenance)}</Td><Td><StatusBadge status={m.amc_status || "Not Applicable"} /></Td><Td>{m.service_count || 0}<br/><Button size="sm" variant="secondary" onClick={() => openServices(m)}>History</Button></Td><Td><div style={{ display:"flex", gap:6 }}>{canEdit && <Button size="sm" variant="secondary" onClick={() => openMachine(m)}>Edit</Button>}{canDelete && <Button size="sm" variant="danger" onClick={() => window.confirm("Delete this machine and its service history?") && onDeleteMachine(m.id)}>Delete</Button>}</div></Td></tr>)}
        {!filtered.length && <tr><td colSpan="9" style={{ padding: 30, textAlign:"center", color: COLORS.neutral }}>No installed machines found.</td></tr>}
      </tbody></table>
    </TableCard>
    <ConsumablesPanel items={consumables} machines={machines} userOptions={userOptions} canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} onSave={onSaveConsumable} onDelete={onDeleteConsumable} />
    <ReplacementPanel items={replacements} machines={machines} userOptions={userOptions} canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} onSave={onSaveReplacement} onDelete={onDeleteReplacement} />
    <Modal title={editingId ? "Edit Installed Machine" : "Add Installed Machine"} open={machineModal} onClose={() => setMachineModal(false)} maxWidth={900}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:16, marginBottom:16 }}>
        <FormField label="Linked Customer (Customer Success only)"><select value={machineForm.leadId} onChange={e => selectLead(e.target.value)} style={inputStyle}><option value="">{leads.length ? "Select Customer Success customer" : "No Customer Success customers available"}</option>{machineForm.leadId && !leads.some(l => String(l.id) === String(machineForm.leadId)) && <option value={machineForm.leadId}>{machineForm.customerName} (existing link)</option>}{leads.map(l => <option key={l.id} value={l.id}>{l.company || l.name}</option>)}</select></FormField>
        {field("Customer Name *","customerName")}{field("Machine Model *","machineModel")}{field("Serial Number","serialNumber")}{field("Installation Date","installationDate","date")}{field("Warranty Start","warrantyStart","date")}{field("Warranty End","warrantyEnd","date")}{field("Next Maintenance","nextMaintenance","date")}{field("Location","location")}
        <FormField label="Assigned Executive"><select value={machineForm.assigned} onChange={e => setMachineForm({...machineForm,assigned:e.target.value,assignedUserId:userIdForValue(userOptions,e.target.value)})} style={inputStyle}>{userOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></FormField>
        <FormField label="AMC Status"><select value={machineForm.amcStatus} onChange={e => setMachineForm({...machineForm,amcStatus:e.target.value})} style={inputStyle}>{["Not Applicable","Active","Due","Expired","Renewed"].map(v=><option key={v}>{v}</option>)}</select></FormField>
        {field("AMC Start","amcStart","date")}{field("AMC End","amcEnd","date")}
        <FormField label="Machine Status"><select value={machineForm.status} onChange={e => setMachineForm({...machineForm,status:e.target.value})} style={inputStyle}>{["Active","Under Service","Inactive","Replaced"].map(v=><option key={v}>{v}</option>)}</select></FormField>
      </div>
      <FormField label="Spare Requirement"><textarea rows={2} value={machineForm.spareRequirement} onChange={e=>setMachineForm({...machineForm,spareRequirement:e.target.value})} style={inputStyle}/></FormField><br/>
      <FormField label="Notes"><textarea rows={3} value={machineForm.notes} onChange={e=>setMachineForm({...machineForm,notes:e.target.value})} style={inputStyle}/></FormField>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}><Button variant="secondary" onClick={()=>setMachineModal(false)}>Cancel</Button><Button onClick={saveMachine}>Save Machine</Button></div>
    </Modal>
    <Modal title={serviceMachine ? `Service History — ${serviceMachine.machine_model}` : "Service History"} open={!!serviceMachine} onClose={() => setServiceMachine(null)} maxWidth={950}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:14}}>
        <FormField label="Service Date *"><input type="date" value={serviceForm.serviceDate} onChange={e=>setServiceForm({...serviceForm,serviceDate:e.target.value})} style={inputStyle}/></FormField>
        <FormField label="Service Category"><select value={serviceForm.serviceCategory} onChange={e=>setServiceForm({...serviceForm,serviceCategory:e.target.value,serviceType:e.target.value})} style={inputStyle}>{["Installation","Preventive Maintenance","Breakdown","Warranty","AMC","Paid Service"].map(v=><option key={v}>{v}</option>)}</select></FormField>
        <FormField label="Service Status"><select value={serviceForm.status} onChange={e=>setServiceForm({...serviceForm,status:e.target.value})} style={inputStyle}>{["Scheduled","In Progress","Completed","Cancelled"].map(v=><option key={v}>{v}</option>)}</select></FormField>
        <FormField label="Assigned Technician"><select value={serviceForm.assignedTechnicianId} onChange={e=>{const user=userOptions.find(o=>String(o.userId)===String(e.target.value));setServiceForm({...serviceForm,assignedTechnicianId:e.target.value,technician:user?.value||""});}} style={inputStyle}><option value="">Select technician</option>{userOptions.filter(o=>o.userId).map(o=><option key={o.userId} value={o.userId}>{o.label}</option>)}</select></FormField>
        <FormField label="Next Service"><input type="date" value={serviceForm.nextServiceDate} onChange={e=>setServiceForm({...serviceForm,nextServiceDate:e.target.value})} style={inputStyle}/></FormField>
        <FormField label="Coverage"><select value={serviceForm.coverageStatus} onChange={e=>setServiceForm({...serviceForm,coverageStatus:e.target.value})} style={inputStyle}>{["Covered","Partially Covered","Chargeable"].map(v=><option key={v}>{v}</option>)}</select></FormField>
        <FormField label="Resolution"><select value={serviceForm.resolutionStatus} onChange={e=>setServiceForm({...serviceForm,resolutionStatus:e.target.value})} style={inputStyle}>{["Resolved","Partially Resolved","Pending Spare","Follow-up Required"].map(v=><option key={v}>{v}</option>)}</select></FormField>
        {[['Customer Contact','customerContactName','text'],['Contact Phone','customerContactPhone','text'],['Labour Cost','laborCost','number'],['Spare Cost','spareCost','number'],['Travel Cost','travelCost','number'],['Downtime Start','downtimeStart','datetime-local'],['Downtime End','downtimeEnd','datetime-local'],['Customer Confirmation','customerConfirmationName','text']].map(([label,key,type])=><FormField key={key} label={label}><input type={type} value={serviceForm[key]||""} onChange={e=>setServiceForm({...serviceForm,[key]:e.target.value})} style={inputStyle}/></FormField>)}
        <FormField label="Customer Rating"><select value={serviceForm.customerRating} onChange={e=>setServiceForm({...serviceForm,customerRating:e.target.value})} style={inputStyle}><option value="">Not rated</option>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} / 5</option>)}</select></FormField>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[['Issue Reported','issueReported'],['Work Performed','workPerformed'],['Spare Used','spareUsed'],['Customer Feedback','customerFeedback'],['Notes','notes']].map(([label,key])=><FormField key={key} label={label}><textarea rows={2} value={serviceForm[key]} onChange={e=>setServiceForm({...serviceForm,[key]:e.target.value})} style={inputStyle}/></FormField>)}</div>
      <div style={{marginTop:12,padding:12,border:`1px solid ${COLORS.border}`,borderRadius:8}}><FormField label="Service Report / Photos (PDF, JPG, PNG, WebP — maximum 5 MB each)"><input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setServiceFiles(Array.from(e.target.files||[]))} style={inputStyle}/></FormField>{serviceFiles.length>0?<div style={{fontSize:12,color:COLORS.neutral,marginTop:6}}>{serviceFiles.map(f=>f.name).join(", ")}</div>:<div style={{fontSize:12,color:COLORS.info,marginTop:6}}>No file selected — the CRM will automatically generate and save the standard service-report PDF.</div>}<div style={{fontSize:12,fontWeight:700,marginTop:8}}>Total service cost: {formatCurrency(Number(serviceForm.laborCost||0)+Number(serviceForm.spareCost||0)+Number(serviceForm.travelCost||0))}</div></div>
      {canAdd && <div style={{display:"flex",justifyContent:"flex-end",margin:"14px 0"}}><Button onClick={saveService}>Add Service Entry</Button></div>}
      <div style={{padding:12,background:COLORS.bg,border:`1px solid ${COLORS.border}`,borderRadius:8,marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8}}><input placeholder="Search issue, work, spare..." value={serviceFilters.search} onChange={e=>setServiceFilters({...serviceFilters,search:e.target.value})} style={inputStyle}/><input type="date" title="From date" value={serviceFilters.dateFrom} onChange={e=>setServiceFilters({...serviceFilters,dateFrom:e.target.value})} style={inputStyle}/><input type="date" title="To date" value={serviceFilters.dateTo} onChange={e=>setServiceFilters({...serviceFilters,dateTo:e.target.value})} style={inputStyle}/><select value={serviceFilters.category} onChange={e=>setServiceFilters({...serviceFilters,category:e.target.value})} style={inputStyle}><option value="">All categories</option>{["Installation","Preventive Maintenance","Breakdown","Warranty","AMC","Paid Service"].map(v=><option key={v}>{v}</option>)}</select><select value={serviceFilters.status} onChange={e=>setServiceFilters({...serviceFilters,status:e.target.value})} style={inputStyle}><option value="">All statuses</option>{["Scheduled","In Progress","Completed","Cancelled"].map(v=><option key={v}>{v}</option>)}</select><select value={serviceFilters.technician} onChange={e=>setServiceFilters({...serviceFilters,technician:e.target.value})} style={inputStyle}><option value="">All technicians</option>{userOptions.filter(o=>o.userId).map(o=><option key={o.userId} value={o.userId}>{o.label}</option>)}</select><select value={serviceFilters.resolution} onChange={e=>setServiceFilters({...serviceFilters,resolution:e.target.value})} style={inputStyle}><option value="">All resolutions</option>{["Resolved","Partially Resolved","Pending Spare","Follow-up Required"].map(v=><option key={v}>{v}</option>)}</select><Button size="sm" variant="secondary" onClick={()=>setServiceFilters(emptyServiceFilters)}>Reset Filters</Button></div><div style={{fontSize:12,color:COLORS.neutral,marginTop:8}}>Showing {filteredServiceHistory.length} of {services.length} service entries</div></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><Th>Date</Th><Th>Category / Status</Th><Th>Issue / Resolution</Th><Th>Technician</Th><Th>Coverage / Cost</Th><Th>Next Service</Th><Th>Files</Th><Th></Th></tr></thead><tbody>{filteredServiceHistory.map(s=><React.Fragment key={s.id}><tr><Td>{formatDate(s.service_date)}</Td><Td>{s.service_category||s.service_type}<br/><StatusBadge status={s.status}/></Td><Td>{s.issue_reported||"-"}<br/><strong>{s.resolution_status||"-"}</strong></Td><Td>{s.technician||"-"}</Td><Td>{s.coverage_status||"-"}<br/>{formatCurrency(s.cost||0)}</Td><Td>{formatDate(s.next_service_date)}</Td><Td><Button size="sm" variant="secondary" onClick={()=>showAttachments(s)}>Files ({s.attachment_count||0})</Button></Td><Td>{canDelete&&<Button size="sm" variant="danger" onClick={async()=>{await onDeleteService(s.id);setServices(prev=>prev.filter(x=>x.id!==s.id));}}>Delete</Button>}</Td></tr>{attachmentServiceId===s.id&&<tr><td colSpan="8" style={{padding:10,background:COLORS.bg}}>{serviceAttachments.length?serviceAttachments.map(a=><Button key={a.id} size="sm" variant="secondary" onClick={()=>crmAPI.downloadMachineServiceAttachment(a.id,a.file_name)}>{a.file_name}</Button>):<span style={{fontSize:12,color:COLORS.neutral}}>No attachments.</span>}</td></tr>}</React.Fragment>)}{!filteredServiceHistory.length&&<tr><td colSpan="8" style={{padding:24,textAlign:"center",color:COLORS.neutral}}>No service entries match the selected filters.</td></tr>}</tbody></table></div>
    </Modal>
  </div>;
};

const CustomerSuccessPage = ({ customerSuccess, onUpdateCustomerSuccess, onRefresh }) => {
  const [editingJourney, setEditingJourney] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  const filtered = useMemo(() => customerSuccess.filter((item) => {
    const q = searchTerm.toLowerCase();
    const textMatch = !q || [item.customer_name, item.lead_name, item.company, item.email, item.phone, item.assigned]
      .some((value) => String(value || "").toLowerCase().includes(q));
    return textMatch && (!stageFilter || item.current_stage === stageFilter);
  }), [customerSuccess, searchTerm, stageFilter]);

  const stageCounts = CUSTOMER_SUCCESS_STAGES.map((stage) => ({
    stage,
    count: customerSuccess.filter((item) => item.current_stage === stage).length,
  }));

  const updateStage = async (item, stage) => {
    setLoadingId(item.id);
    try {
      await onUpdateCustomerSuccess(item.id, { ...item, currentStage: stage });
      await onRefresh();
    } catch (err) { alert("Error updating customer success: " + err.message); }
    finally { setLoadingId(null); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Customer Success Automation</h1>
          <p style={{ fontSize: 14, color: COLORS.neutral, margin: 0 }}>Starts when an order is received - {customerSuccess.length} active journeys</p>
        </div>
        <Button variant="secondary" icon={CheckCircle2} onClick={onRefresh}>Refresh</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {stageCounts.map(({ stage, count }) => (
          <div key={stage} onClick={() => setStageFilter(stageFilter === stage ? "" : stage)} style={{ background: COLORS.bgCard, border: `1px solid ${stageFilter === stage ? COLORS.primary : COLORS.border}`, borderLeft: `4px solid ${COLORS.primary}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
            <div style={{ fontSize: 11, color: COLORS.neutral, fontWeight: 700, textTransform: "uppercase" }}>{stage}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, marginTop: 4 }}>{count}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <FilterGroup label="Search">
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: COLORS.neutral }} />
            <input placeholder="Search customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, width: 240, paddingLeft: 32 }} />
          </div>
        </FilterGroup>
        <FilterGroup label="Stage">
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">All</option>{CUSTOMER_SUCCESS_STAGES.map(stage => <option key={stage}>{stage}</option>)}
          </select>
        </FilterGroup>
        <button onClick={() => { setSearchTerm(""); setStageFilter(""); }} style={{ ...inputStyle, width: "auto", background: COLORS.bg, cursor: "pointer", color: COLORS.neutral, marginTop: 16 }}>X Clear</button>
      </FilterBar>

      <TableCard title="Customer Success Journeys" count={filtered.length}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Customer", "Company", "Email", "Phone", "Current Stage", "Assigned", "Due Date", "Status", "Actions"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? <NoData cols={9} /> : filtered.map((item) => {
              const currentIndex = CUSTOMER_SUCCESS_STAGES.indexOf(item.current_stage);
              const path = CUSTOMER_SUCCESS_STAGES.filter(s => !['Complaint / Support','Lost / Cancelled Order'].includes(s));
              const pathIndex = path.indexOf(item.current_stage);
              const nextStage = pathIndex >= 0 ? path[pathIndex + 1] : null;
              return (
                <tr key={item.id}>
                  <Td><span style={{ fontWeight: 700 }}>{cleanText(item.customer_name || item.lead_name)}</span></Td>
                  <Td>{cleanText(item.company)}</Td>
                  <Td style={{ color: COLORS.secondary }}>{cleanText(item.email)}</Td>
                  <Td>{cleanText(item.phone)}</Td>
                  <Td>
                    <select value={item.current_stage} onChange={(e) => updateStage(item, e.target.value)} style={{ ...inputStyle, minWidth: 210 }} disabled={loadingId === item.id}>
                      {!CUSTOMER_SUCCESS_STAGES.includes(item.current_stage) && <option value={item.current_stage}>{item.current_stage} (previous workflow)</option>}{CUSTOMER_SUCCESS_STAGES.map(stage => <option key={stage}>{stage}</option>)}
                    </select>
                  </Td>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.assigned} size={28} /><span style={{ fontSize: 12, color: COLORS.neutral }}>{cleanText(item.assigned)}</span></div></Td>
                  <Td>{formatDate(item.due_date)}</Td>
                  <Td><StatusBadge status={item.status || "Active"} /></Td>
                  <Td><Button size="sm" variant="secondary" onClick={()=>setEditingJourney(item)}>Order Details</Button>{nextStage ? <Button size="sm" onClick={() => updateStage(item, nextStage)} disabled={loadingId === item.id}>Next Stage</Button> : null}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableCard>
      <Modal title="Customer Order Details" open={!!editingJourney} onClose={()=>setEditingJourney(null)} maxWidth={900}>
        {editingJourney && <CustomerSuccessDetails item={editingJourney} stages={CUSTOMER_SUCCESS_STAGES} onSave={async data=>{await onUpdateCustomerSuccess(editingJourney.id,data);await onRefresh();setEditingJourney(null);}} />}
      </Modal>
    </div>
  );
};
// ---------------------------------------------------------------------------
// SOURCES PAGE (MASTER DATA)
// ---------------------------------------------------------------------------
const SourcesPage = ({ leads }) => {
  const sourceStats = LEAD_SOURCES.map(s => ({
    source: s,
    count: leads.filter(l => l.source === s).length,
    value: leads.filter(l => l.source === s).reduce((sum, l) => sum + (Number(l.value) || 0), 0),
    converted: leads.filter(l => l.source === s && l.converted).length,
  }));

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Lead Sources</h1>
      <p style={{ fontSize: 14, color: COLORS.neutral, margin: "0 0 24px 0" }}>Track where your leads originate from</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {sourceStats.map(s => {
          const convRate = s.count ? ((s.converted / s.count) * 100).toFixed(0) : 0;
          return (
            <div key={s.source} style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{s.source}</div>
                <div style={{ background: COLORS.primary + "15", color: COLORS.primary, borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{s.count} leads</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Value</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.secondary }}>{formatCurrency(s.value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Conversion</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.success }}>{convRate}%</div>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${convRate}%`, background: COLORS.success, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// REPORTS PAGE
// ---------------------------------------------------------------------------
const ReportsPage = ({ leads, proposals, followups, navigate, userOptions = DEFAULT_USER_OPTIONS }) => {
  const stageData = LEAD_STAGES.map(s => ({ stage: s, count: leads.filter(l => l.stage === s).length, value: leads.filter(l => l.stage === s).reduce((sum, l) => sum + (Number(l.value) || 0), 0) }));
  const sourceData = LEAD_SOURCES.map(s => ({ source: s, count: leads.filter(l => l.source === s).length })).filter(s => s.count > 0);
  const userLeads = userOptions.map(u => ({ name: u.value, leads: leads.filter(l => l.assigned === u.value).length, proposals: proposals.filter(p => p.sentBy === u.value).length }));
  const totalValue = proposals.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const wonValue = proposals.filter(p => p.status === "Accepted").reduce((s, p) => s + (Number(p.value) || 0), 0);
  const winRate = proposals.length ? ((proposals.filter(p => p.status === "Accepted").length / proposals.length) * 100).toFixed(1) : 0;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Reports</h1>
      <p style={{ fontSize: 14, color: COLORS.neutral, margin: "0 0 24px 0" }}>Sales analytics and performance overview</p>
      <EnquiryReport leads={leads} proposals={proposals} followups={followups} userOptions={userOptions} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <KPICard icon={Users} label="Total Leads" value={leads.length} color={COLORS.primary} onClick={() => navigate("/crm/leads")} />
        <KPICard icon={FileText} label="Pipeline" value={formatCurrency(totalValue)} color={COLORS.secondary} onClick={() => navigate("/crm/proposals")} />
        <KPICard icon={Check} label="Won Value" value={formatCurrency(wonValue)} color={COLORS.success} onClick={() => navigate("/crm/proposals")} />
        <KPICard icon={TrendingUp} label="Win Rate" value={`${winRate}%`} color={COLORS.info} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Leads by Stage</h3>
          </div>
          <div style={{ padding: 20 }}>
            {stageData.map(s => {
              const pct = leads.length ? (s.count / leads.length) * 100 : 0;
              const color = getStageTextColor(s.stage);
              return (
                <div key={s.stage} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.stage}</span>
                    <span style={{ fontSize: 13, color: COLORS.neutral }}>{s.count} - {formatCurrency(s.value)}</span>
                  </div>
                  <div style={{ height: 8, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Team Performance</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Member", "Leads", "Proposals"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {userLeads.map(u => (
                <tr key={u.name}>
                  <Td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar name={u.name} /><span style={{ fontWeight: 600 }}>{u.name}</span></div></Td>
                  <Td style={{ fontWeight: 700, color: COLORS.primary }}>{u.leads}</Td>
                  <Td style={{ fontWeight: 700, color: COLORS.secondary }}>{u.proposals}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>By Source</h3>
        </div>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {sourceData.length === 0 ? <p style={{ color: COLORS.neutral, fontSize: 13 }}>No data</p> :
            sourceData.map(s => (
              <div key={s.source} style={{ background: COLORS.bg, borderRadius: 8, padding: 12, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 12, color: COLORS.neutral, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{s.source}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.primary }}>{s.count}</div>
                <div style={{ fontSize: 10, color: COLORS.neutral, marginTop: 2 }}>{leads.length ? ((s.count / leads.length) * 100).toFixed(0) : 0}% of total</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SETTINGS PAGE
// ---------------------------------------------------------------------------
const SettingsPage = ({ userOptions = DEFAULT_USER_OPTIONS }) => {
  const [saved, setSaved] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState({
    company: "Manod Technologies",
    currency: "INR",
    defaultAssigned: firstUserValue(userOptions),
    defaultStage: "New",
    defaultSource: "Website", crmIndustry: "general"
  });

  useEffect(() => {
    let active = true;
    crmAPI.fetchSettings().then(({ settings: stored }) => {
      if (!active || !stored) return;
      setSettings({
        company: stored.company_name || "Manod Technologies",
        currency: stored.currency || "INR",
        defaultAssigned: stored.default_assigned || firstUserValue(userOptions),
        defaultStage: stored.default_stage || "New",
        defaultSource: stored.default_source || "Website",
        crmIndustry: stored.crm_industry || "general",
      });
    }).catch((error) => alert(`Unable to load settings: ${error.message}`)).finally(() => { if (active) setLoadingSettings(false); });
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSavingSettings(true);
    try {
      await crmAPI.updateSettings({
        companyName: settings.company,
        currency: settings.currency,
        defaultAssigned: settings.defaultAssigned,
        defaultStage: settings.defaultStage,
        defaultSource: settings.defaultSource,
        crmIndustry: settings.crmIndustry,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) { alert(`Unable to save settings: ${error.message}`); }
    finally { setSavingSettings(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px 0" }}>Settings</h1>
      <p style={{ fontSize: 14, color: COLORS.neutral, margin: "0 0 24px 0" }}>Configure your CRM system</p>
      <LocalBackupPanel />
      <div style={{ maxWidth: 600, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 28 }}>
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <label style={labelStyle}>Company Name</label>
            <input value={settings.company} onChange={e => setSettings({ ...settings, company: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Default Assigned User</label>
            <select value={settings.defaultAssigned} onChange={e => setSettings({ ...settings, defaultAssigned: e.target.value })} style={inputStyle}>
              {userOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Default Lead Stage</label>
            <select value={settings.defaultStage} onChange={e => setSettings({ ...settings, defaultStage: e.target.value })} style={inputStyle}>
              {MANUAL_LEAD_STAGES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>CRM Industry</label>
            <select value={settings.crmIndustry} onChange={e => setSettings({ ...settings, crmIndustry: e.target.value })} style={inputStyle}>
              <option value="general">IT / General CRM</option>
              <option value="machine">Machine Service CRM</option>
              <option value="export">Textile / Export CRM</option>
              <option value="real_estate">Real Estate CRM</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, color: COLORS.neutral }}>Save and refresh to show the relevant workspace.</div>
          </div>
          <div>
            <label style={labelStyle}>Default Lead Source</label>
            <select value={settings.defaultSource} onChange={e => setSettings({ ...settings, defaultSource: e.target.value })} style={inputStyle}>
              {LEAD_SOURCES.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
            {saved && <span style={{ color: COLORS.success, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={16} /> Saved!</span>}
            <Button onClick={handleSave} disabled={loadingSettings || savingSettings}>{savingSettings ? "Saving..." : loadingSettings ? "Loading..." : "Save Settings"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MAIN CRM MODULE
// ---------------------------------------------------------------------------
export function CRMRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission, isAdmin, loaded: permissionsLoaded, userRole } = usePermissions();
  const isSalesRole = /sales|marketing/i.test(String(userRole || ""));
  const salesTabs = ["leads", "followups"];
  const canViewMachines = isAdmin || hasPermission("Machine Service", "View machine service");

  const getTabFromPath = (pathname) => {
    const seg = pathname.replace("/crm", "").replace(/^\//, "").split("/")[0];
    const map = {
      "": "dashboard", "leads": "leads", "proposals": "proposals", "payment-reminders": "payment-reminders", "customer-success": "customer-success",
      "follow-ups": "followups", "followups": "followups", "campaigns": "campaigns", "contacts": "contacts",
      "machines": "machines", "reports": "reports", "sources": "sources", "settings": "settings", "export": "export", "real-estate": "real-estate",
    };
    return map[seg] || "dashboard";
  };

  const activeTab = getTabFromPath(location.pathname);

  useEffect(() => {
    if (!permissionsLoaded || isAdmin) return;
    if (isSalesRole && !salesTabs.includes(activeTab)) navigate("/crm/follow-ups", { replace: true });
    if (!isSalesRole) navigate("/profile", { replace: true });
  }, [permissionsLoaded, isAdmin, isSalesRole, activeTab, navigate]);

  const handleTabChange = (tab) => {
    const pathMap = {
      dashboard: "/crm", leads: "/crm/leads", proposals: "/crm/proposals", "payment-reminders": "/crm/payment-reminders", "customer-success": "/crm/customer-success",
      followups: "/crm/follow-ups", campaigns: "/crm/campaigns", contacts: "/crm/contacts",
      machines: "/crm/machines", reports: "/crm/reports", sources: "/crm/sources", settings: "/crm/settings", export: "/crm/export", "real-estate": "/crm/real-estate",
    };
    navigate(pathMap[tab] || "/crm");
  };

  const [leads, setLeads] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [customerSuccess, setCustomerSuccess] = useState([]);
  const [paymentReminders, setPaymentReminders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [crmIndustry, setCrmIndustry] = useState('general');
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
const reloadCustomerSuccess = async () => {
  try {
    const res = await crmAPI.fetchCustomerSuccess();
    setCustomerSuccess(res.customerSuccess || []);
    return res.customerSuccess || [];
  } catch (err) {
    console.error("Customer Success data failed to load:", err);
    setCustomerSuccess([]);
    return [];
  }
};

const reloadPaymentReminders = async () => {
  try {
    const res = await crmAPI.fetchPaymentReminders();
    setPaymentReminders(res.paymentReminders || []);
    return res.paymentReminders || [];
  } catch (err) {
    console.error("Payment Reminder data failed to load:", err);
    setPaymentReminders([]);
    return [];
  }
};

const fetchAll = async () => {
  setLoading(true);setError(null);
  const jobs = [
    ['Assigned users',crmAPI.fetchAssignees,setRegisteredUsers,'users'],
    ['Leads',crmAPI.fetchLeads,setLeads,'leads'],
    ['Follow-ups',crmAPI.fetchFollowups,setFollowups,'followups'],
    ...(isAdmin ? [
      ['Proposals',crmAPI.fetchProposals,setProposals,'proposals'],
      ['Campaigns',crmAPI.fetchCampaigns,setCampaigns,'campaigns'],
      ['Contacts',crmAPI.fetchContacts,setContacts,'contacts'],
      ['Customer Success',crmAPI.fetchCustomerSuccess,setCustomerSuccess,'customerSuccess'],
      ['Payments',crmAPI.fetchPaymentReminders,setPaymentReminders,'paymentReminders'],
      ['Machines',crmAPI.fetchMachines,setMachines,'machines'],
      ['Consumables',crmAPI.fetchMachineConsumables,setConsumables,'consumables'],
      ['Replacements',crmAPI.fetchMachineReplacements,setReplacements,'replacements'],

    ] : []),
  ];
  try {
    const results=await Promise.allSettled(jobs.map(async ([label,fetcher,setter,key])=>{
      const data=await fetcher();const rows=Array.isArray(data)?data:data[key];
      if(!Array.isArray(rows))throw new Error(label+' returned an invalid response');
      setter(rows);
    }));
    const failures=results.flatMap((r,i)=>r.status==='rejected'?[jobs[i][0]]:[]);
    if(failures.length)setError('Could not reload '+failures.join(', ')+'. Previously loaded rows are retained. Check the local server and retry.');
  } catch {setError('Unable to reload CRM data. Check the local server and retry.');}
  finally {setLoading(false);}
};
  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { crmAPI.fetchSettings().then(({ settings }) => setCrmIndustry(settings?.crm_industry || 'general')).catch(() => {}); }, []);
  useEffect(() => {
    if (activeTab === "customer-success") reloadCustomerSuccess();
    if (activeTab === "payment-reminders") reloadPaymentReminders();
  }, [activeTab]);

  const handleAddLead = async (data) => {
    const res = await crmAPI.createLead(data);
    setLeads(prev => [res.lead, ...prev]);
    await fetchAll();
  };

  const handleImportLeads = async (rows) => {
    let imported = 0;
    let failed = 0;
    let emailFailed = 0;
    for (const row of rows) {
      try {
        const res = await crmAPI.createLead(row);
        imported += 1;
        const automation = res.automation || {};
        if (row.email && automation.welcomeEmailSent === false) emailFailed += 1;
        if (automation.salespersonEmailSent === false) emailFailed += 1;
      } catch {
        failed += 1;
      }
    }
    await fetchAll();
    return { imported, failed, emailFailed };
  };

  const handleEditLead = async (id, data) => {
    const res = await crmAPI.updateLead(id, data);
    setLeads(prev => prev.map(l => l.id === id ? res.lead : l));
    await fetchAll();
  };

  const handleDeleteLead = async (id) => {
    await crmAPI.deleteLead(id);
    setLeads(prev => prev.filter(l => l.id !== id));
  };

  const handleConvertLead = async (id) => {
    const lead = leads.find(l => l.id === id);
    const res = await crmAPI.convertLead(id);
    setLeads(prev => prev.map(l => l.id === id ? res.lead : l));
    await fetchAll();
    if (lead) {
      await crmAPI.createContact({
        firstName: lead.name.split(" ")[0],
        lastName: lead.name.split(" ").slice(1).join(" ") || "-",
        email: lead.email,
        mobile: lead.phone || lead.mobile,
        linkedLead: lead.name,
        active: true
      }).catch(e => console.error("Contact creation failed:", e));
    }
  };

  const handleAiCallLead = async (lead) => {
    if (!lead?.id) {
      alert("Select a lead before starting an AI call.");
      return;
    }

    const phone = lead.phone || lead.mobile;
    if (!phone) {
      alert("This lead does not have a phone number.");
      return;
    }

    if (!window.confirm(`Start AI call for ${lead.name || "this lead"} at ${phone}?`)) return;

    try {
      const res = await crmAPI.callLeadAi(lead.id);
      alert(res.message || `AI call started for ${lead.name || "lead"}.`);
      await fetchAll();
    } catch (err) {
      alert(`AI call failed: ${err.message}`);
    }
  };
  const handleAddProposal = async (data) => {
    const res = await crmAPI.createProposal(data);
    setProposals(prev => [res.proposal, ...prev]);
    await fetchAll();
  };
const handleEditProposal = async (id, data) => {
    const res = await crmAPI.updateProposal(id, data);
    setProposals(prev => prev.map(p => p.id === id ? res.proposal : p));
    await fetchAll();
  };
  const handleDeleteProposal = async (id) => {
    await crmAPI.deleteProposal(id);
    setProposals(prev => prev.filter(p => p.id !== id));
  };

  const handleProposalStatus = async (id, status) => {
    const existing = proposals.find(p => p.id === id);
    const res = await crmAPI.updateProposal(id, { ...existing, status });
    setProposals(prev => prev.map(p => p.id === id ? res.proposal : p));
    await fetchAll();
  };

  const handleSendProposal = async (id) => {
    const res = await crmAPI.sendProposal(id);
    setProposals(prev => prev.map(p => p.id === id ? res.proposal : p));
    await fetchAll();
  };

  const handleAddFollowup = async (data) => {
    const res = await crmAPI.createFollowup(data);
    setFollowups(prev => [res.followup, ...prev]);
  };

  const handleEditFollowup = async (id, data) => {
    const res = await crmAPI.updateFollowup(id, data);
    setFollowups(prev => prev.map(f => f.id === id ? res.followup : f));
  };
  const handleDeleteFollowup = async (id) => {
    await crmAPI.deleteFollowup(id);
    setFollowups(prev => prev.filter(f => f.id !== id));
  };

const handleMarkComplete = async (id) => {
    const existing = followups.find(f => f.id === id);
    const res = await crmAPI.updateFollowup(id, { ...existing, lead: existing.lead || existing.lead_name, status: "Completed" });
    setFollowups(prev => prev.map(f => f.id === id ? res.followup : f));
  };
  const handleAddCampaign = async (data) => {
    const res = await crmAPI.createCampaign(data);
    setCampaigns(prev => [res.campaign, ...prev]);
    return res;
  };

  const handleSendCampaign = async (id, data) => {
    const res = await crmAPI.sendCampaign(id, data);
    setCampaigns(prev => prev.map(c => c.id === id ? res.campaign : c));
    return res;
  };

  const handleDeleteCampaign = async (id) => {
  await crmAPI.deleteCampaign(id);
  setCampaigns(prev => prev.filter(c => c.id !== id));
};
  const handleAddContact = async (data) => {
    const res = await crmAPI.createContact(data);
    setContacts(prev => [res.contact, ...prev]);
  };

  const handleDeleteContact = async (id) => {
    await crmAPI.deleteContact(id);
    setContacts(prev => prev.filter(c => c.id !== id));
  };


  const handleUpdateCustomerSuccess = async (id, data) => {
    const res = await crmAPI.updateCustomerSuccess(id, data);
    setCustomerSuccess(prev => prev.map(item => item.id === id ? res.customerSuccess : item));
  };

  const handleUpdatePaymentReminder = async (id, data) => {
    const res = await crmAPI.updatePaymentReminder(id, data);
    setPaymentReminders(prev => prev.map(item => item.id === id ? res.paymentReminder : item));
  };

  const handleCreateCustomerSuccessFromLead = async (leadId) => {
    const res = await crmAPI.createCustomerSuccessFromLead(leadId);
    setCustomerSuccess(prev => [res.customerSuccess, ...prev.filter(item => item.id !== res.customerSuccess.id)]);
  };
  const handleSaveMachine = async (id, data) => {
    const res = id ? await crmAPI.updateMachine(id, data) : await crmAPI.createMachine(data);
    setMachines(prev => id ? prev.map(item => item.id === id ? res.machine : item) : [res.machine, ...prev]);
    await fetchAll();
    return res.machine;
  };
  const handleDeleteMachine = async (id) => { await crmAPI.deleteMachine(id); setMachines(prev => prev.filter(item => item.id !== id)); };
  const handleLoadMachineServices = async (id) => (await crmAPI.fetchMachineServices(id)).services || [];
  const handleAddMachineService = async (id, data) => { const res = await crmAPI.createMachineService(id, data); await fetchAll(); return res.service; };
  const handleDeleteMachineService = async (id) => { await crmAPI.deleteMachineService(id); await fetchAll(); };
  const handleSaveConsumable = async (id, data) => {
    const res = id ? await crmAPI.updateMachineConsumable(id, data) : await crmAPI.createMachineConsumable(data);
    setConsumables(prev => id ? prev.map(item => item.id === id ? res.consumable : item) : [res.consumable, ...prev]);
    return res.consumable;
  };
  const handleDeleteConsumable = async (id) => {
    await crmAPI.deleteMachineConsumable(id);
    setConsumables(prev => prev.filter(item => item.id !== id));
  };
  const handleSaveReplacement = async (id, data) => {
    const res = id ? await crmAPI.updateMachineReplacement(id, data) : await crmAPI.createMachineReplacement(data);
    setReplacements(prev => id ? prev.map(item => item.id === id ? res.replacement : item) : [res.replacement, ...prev]);
    return res.replacement;
  };
  const handleDeleteReplacement = async (id) => {
    await crmAPI.deleteMachineReplacement(id);
    setReplacements(prev => prev.filter(item => item.id !== id));
  };
  const userOptions = useMemo(() => buildUserOptions(registeredUsers), [registeredUsers]);
  const machineCustomerLeads = useMemo(() => {
    const customerLeadIds = new Set(customerSuccess.map(item => String(item.lead_id || "")).filter(Boolean));
    const customerNames = new Set(customerSuccess.flatMap(item => [item.lead_name, item.customer_name, item.company]).map(value => cleanText(value, "").toLowerCase()).filter(Boolean));
    return leads.filter(lead => customerLeadIds.has(String(lead.id)) || [lead.name, lead.company].some(value => customerNames.has(cleanText(value, "").toLowerCase())));
  }, [leads, customerSuccess]);

  const counts = {
  leads: leads.filter(l => l && !l.converted).length,
  followups: followups.filter(f => f && f.status === "Scheduled").length,
  proposals: proposals.filter(p => p && ["Sent", "Viewed"].includes(p.status)).length,
  paymentReminders: paymentReminders.filter(item => item && item.status !== "Completed").length,
  customerSuccess: customerSuccess.filter(item => item && item.status !== "Completed").length,
  machines: machines.filter(item => item && item.status === "Active").length,
};

  if (loading) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: `4px solid ${COLORS.border}`, borderTop: `4px solid ${COLORS.primary}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.primary }}>Loading CRM...</div>
          {error && <div style={{ fontSize: 13, color: COLORS.danger, marginTop: 8, maxWidth: 400 }}>{error}</div>}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }}>
      {error && <div role="alert" style={{padding:16,background:"#fff1f2",color:"#991b1b"}}>{error} <button type="button" onClick={fetchAll}>Retry loading data</button></div>}
      <CRMNav activeTab={activeTab} onTabChange={handleTabChange} counts={counts} canViewMachines={canViewMachines} allowedTabs={isAdmin ? null : salesTabs} crmIndustry={crmIndustry} />
      {isAdmin && <SimpleCRMAssistant leads={leads} proposals={proposals} followups={followups} paymentReminders={paymentReminders} customerSuccess={customerSuccess} navigate={navigate} />}

      {isAdmin && activeTab === "dashboard" && (crmIndustry === 'export' || crmIndustry === 'real_estate'
        ? <IndustryDashboard industry={crmIndustry} onOpen={(tab) => handleTabChange(tab)} />
        : <CRMDashboard leads={leads} proposals={proposals} followups={followups} paymentReminders={paymentReminders} machines={machines} consumables={consumables} replacements={replacements} canViewMachines={canViewMachines} navigate={navigate} userOptions={userOptions} />)}
      {(isAdmin || isSalesRole) && activeTab === "leads" && <LeadsPage leads={leads} followups={followups} userOptions={userOptions} onAddLead={handleAddLead} onImportLeads={handleImportLeads} onEditLead={handleEditLead} onDeleteLead={handleDeleteLead} onConvertLead={handleConvertLead} onAiCall={handleAiCallLead} onAddFollowup={handleAddFollowup} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}
      {(isAdmin || isSalesRole) && activeTab === "followups" && <FollowUpsPage followups={followups.filter(f => f.status !== "Completed")} leads={leads} userOptions={userOptions} onAddFollowup={handleAddFollowup} onEditFollowup={handleEditFollowup} onDeleteFollowup={handleDeleteFollowup} onMarkComplete={handleMarkComplete} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}
      {activeTab === "payment-reminders" && <PaymentRemindersPage paymentReminders={paymentReminders} onUpdatePaymentReminder={handleUpdatePaymentReminder} onRefresh={async () => { await fetchAll(); await reloadPaymentReminders(); await reloadCustomerSuccess(); }} />}
      {activeTab === "customer-success" && <CustomerSuccessPage customerSuccess={customerSuccess} leads={leads} userOptions={userOptions} onUpdateCustomerSuccess={handleUpdateCustomerSuccess} onCreateFromLead={handleCreateCustomerSuccessFromLead} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}
      {crmIndustry === 'machine' && activeTab === "machines" && (canViewMachines
        ? <MachinesServicePage machines={machines} consumables={consumables} replacements={replacements} leads={machineCustomerLeads} userOptions={userOptions} onSaveMachine={handleSaveMachine} onDeleteMachine={handleDeleteMachine} onLoadServices={handleLoadMachineServices} onAddService={handleAddMachineService} onDeleteService={handleDeleteMachineService} onSaveConsumable={handleSaveConsumable} onDeleteConsumable={handleDeleteConsumable} onSaveReplacement={handleSaveReplacement} onDeleteReplacement={handleDeleteReplacement} />
        : <div style={{ padding: 32, color: COLORS.danger, fontWeight: 600 }}>You do not have permission to view machine and service records.</div>)}
{activeTab === "proposals" && <ProposalsPage proposals={proposals} leads={leads} userOptions={userOptions} onAddProposal={handleAddProposal} onEditProposal={handleEditProposal} onDeleteProposal={handleDeleteProposal} onStatusChange={handleProposalStatus} onSendProposal={handleSendProposal} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}      {activeTab === "contacts" && <ContactsPage contacts={contacts} leads={leads} onAddContact={handleAddContact} onDeleteContact={handleDeleteContact} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}
      {isAdmin && crmIndustry === 'export' && activeTab === "export" && <ExportWorkspace />}
      {isAdmin && crmIndustry === 'real_estate' && activeTab === "real-estate" && <RealEstateWorkspace />}
      {activeTab === "campaigns" && <CampaignsPage campaigns={campaigns} leads={leads} userOptions={userOptions} onAddCampaign={handleAddCampaign} onDeleteCampaign={handleDeleteCampaign} onSendCampaign={handleSendCampaign} onRefresh={async () => { await fetchAll(); await reloadCustomerSuccess(); }} />}
      {activeTab === "reports" && <ReportsPage leads={leads} proposals={proposals} followups={followups} navigate={navigate} userOptions={userOptions} />}
      {activeTab === "sources" && <SourcesPage leads={leads} />}
      {activeTab === "settings" && <SettingsPage userOptions={userOptions} />}
    </div>
  );
}





























