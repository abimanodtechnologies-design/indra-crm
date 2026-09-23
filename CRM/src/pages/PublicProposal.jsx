import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CRM_API_BASE_URL } from "../api/config";
import { downloadQuotationPdf } from "../utils/quotationPdf";
import manodLogo from "../assets/manod-logo.jpg";

export default function PublicProposal() {
  const { token } = useParams();
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${CRM_API_BASE_URL}/public/proposals/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to open proposal.");
        if (active) setProposal(data.proposal);
      })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [token]);

  const respond = async (decision) => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${CRM_API_BASE_URL}/public/proposals/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason, comment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save response.");
      setProposal((current) => ({
        ...current,
        status: data.proposal.status,
        response_reason: reason,
        response_comment: comment,
      }));
      setShowResponseForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = () => {
    if (!proposal) return;
    let customerInfo = proposal.customer_info || {};
    if (typeof customerInfo === "string") {
      try { customerInfo = JSON.parse(customerInfo || "{}"); } catch { customerInfo = {}; }
    }
    downloadQuotationPdf({ ...proposal, customerInfo });
  };

  if (error && !proposal) {
    return <main style={shell}><div style={errorCard}><h2>Proposal unavailable</h2><p>{error}</p></div></main>;
  }
  if (!proposal) return <main style={shell}><div style={errorCard}>Loading quotation…</div></main>;

  const terminal = ["Accepted", "Rejected", "Expired"].includes(proposal.status);
  const customer = typeof proposal.customer_info === "string"
    ? (() => { try { return JSON.parse(proposal.customer_info || "{}"); } catch { return {}; } })()
    : (proposal.customer_info || {});
  const items = Array.isArray(proposal.quotation_items) ? proposal.quotation_items : [];
  const gstPercent = Number(proposal.gst_percent ?? 18);
  const totals = getQuotationTotals(items, gstPercent, proposal.value);
  const advancePercent = Math.min(100, Math.max(0, Number(proposal.advance_percent ?? 30)));
  const finalPercent = 100 - advancePercent;
  const savedPaymentTerms = String(proposal.payment_terms || "").trim();
  const additionalPaymentNote = /\d+(?:\.\d+)?\s*%/.test(savedPaymentTerms) ? "" : savedPaymentTerms;
  const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <main style={shell}>
      <style>{responsiveStyles}</style>
      <div style={scrollArea}>
        <section style={documentCard}>
          <header style={documentHeader}>
            <div style={brandGroup}>
              <img src={manodLogo} alt="Manod Technologies logo" style={brandLogo} className="quotation-brand-logo" />
              <div>
                <div style={brand}>INDRA ENGINEERING SERVICES</div>
                <div style={companyMeta}>No: 16, VJ Complex, Vilankuruchi Road, Coimbatore-641035</div>
                <div style={companyMeta}>GSTIN: 33ADWPV5385L3ZE · PH: 9047013803</div>
                <div style={companyMeta}>sales@coimbatorecnctools.com · www.coimbatorecnctools.com</div>
              </div>
            </div>
            <div style={statusPill} data-status={proposal.status}>{proposal.status}</div>
          </header>

          <div style={titleBlock}>
            <h1>{proposal.subject || "Sales Quotation"}</h1>
            <p>Prepared for <strong>{customer.businessName || proposal.lead_name}</strong></p>
            <div style={customerDetails}>
              {customer.contact && <span>Contact: {customer.contact}</span>}
              {customer.mobile && <span>Phone: {customer.mobile}</span>}
              {customer.email && <span>Email: {customer.email}</span>}
              {(customer.location || customer.address) && <span>Address: {[customer.location, customer.address].filter(Boolean).join(", ")}</span>}
            </div>
          </div>

          <div style={previewHeading}>
            <div>
              <strong>Quotation</strong>
              <span style={{ display: "block", marginTop: 4, color: "#617066", fontSize: 12 }}>Scroll vertically to review the quotation. On narrow screens, scroll the item table horizontally.</span>
            </div>
          </div>
          <section style={quotationSheet} aria-label="Quotation details">
            <div style={quotationMeta} className="quotation-meta">
              <div><strong>Quotation No.</strong><span>{proposal.quotation_no || proposal.quotationNo || proposal.id}</span></div>
              <div><strong>Date</strong><span>{new Date().toLocaleDateString("en-IN")}</span></div>
              <div><strong>Valid until</strong><span>{proposal.due_date ? new Date(proposal.due_date).toLocaleDateString("en-IN") : "30 days"}</span></div>
              <div><strong>Reference</strong><span>{proposal.subject || "Sales Quotation"}</span></div>
            </div>
            <p style={{ margin: "18px 0 12px" }}>We thank you for your enquiry. Please find our quotation for the requested products.</p>
            <div style={itemTableScroll} tabIndex={0} aria-label="Quotation items; scroll horizontally if needed">
              <table style={itemTable} className="quotation-table">
                <thead><tr>{["S.No", "Brand / Product and Specification", "Quantity", "Rate", "Discount", "Amount"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>
                  {items.length ? items.map((item, index) => {
                    const qty = Number(item.qty || item.quantity || 0);
                    const rate = Number(item.unitPrice || item.unit_price || 0);
                    const discount = Math.min(100, Math.max(0, Number(item.discount || 0)));
                    const amount = qty * rate * (1 - discount / 100);
                    return <tr key={`${item.product || item.name || "item"}-${index}`}>
                      <td>{index + 1}</td>
                      <td><strong>{[item.brand, item.product || item.productName || item.name].filter(Boolean).join(" - ") || "Product"}</strong>{(item.description || item.specification) && <div style={{ color: "#536157", marginTop: 4 }}>{item.description || item.specification}</div>}</td>
                      <td>{qty} {item.unit || "Nos"}</td><td>{formatMoney(rate)}</td><td>{discount}%</td><td style={{ textAlign: "right" }}>{formatMoney(amount)}</td>
                    </tr>;
                  }) : <tr><td colSpan={6}>No product lines were added.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={totalsWrap} className="quotation-totals">
              <div><span>Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div>
              <div><span>GST @ {gstPercent}%</span><strong>{formatMoney(totals.gst)}</strong></div>
              <div style={grandTotalRow}><span>Grand Total</span><strong>{formatMoney(totals.total)}</strong></div>
              <div><span>Advance ({advancePercent}%)</span><strong>{formatMoney(totals.total * advancePercent / 100)}</strong></div>
              <div><span>Balance ({finalPercent}%)</span><strong>{formatMoney(totals.total * finalPercent / 100)}</strong></div>
            </div>
            <section style={termsBlock} className="quotation-terms">
              <h2>Terms &amp; Conditions for Sale</h2>
              <dl>
                <div><dt>Delivery</dt><dd>2-3 Weeks</dd></div>
                <div><dt>Price</dt><dd>As quoted above</dd></div>
                <div><dt>Payment</dt><dd>{advancePercent}% advance payment with order confirmation and {finalPercent}% balance payment before dispatch.</dd></div>
                {additionalPaymentNote && <div><dt>Additional payment note</dt><dd>{additionalPaymentNote}</dd></div>}
                <div><dt>Taxes</dt><dd>GST @ {gstPercent}% as shown above</dd></div>
                <div><dt>Freight</dt><dd>Not applicable unless otherwise agreed</dd></div>
                <div><dt>Validity</dt><dd>{proposal.due_date ? new Date(proposal.due_date).toLocaleDateString("en-IN") : "30 days"}</dd></div>
              </dl>
            </section>
            <div style={quotationFooter} className="quotation-footer">
              <div><strong>Bank Account Details</strong><br/>Beneficiary: INDRA ENGINEERING SERVICES<br/>Kotak Mahindra Bank, Saravanampatti<br/>A/C No: 9360310006<br/>IFSC: KKBK0008673</div>
              <div style={{ textAlign: "right" }}><strong>For INDRA ENGINEERING SERVICES</strong><br/><br/>G. Vishnuvathanan<br/>(9360318362)<br/>vishnu@coimbatorecnctools.com</div>
            </div>
          </section>

          {showResponseForm && !terminal && (
            <section style={responseForm} aria-label="Customer response form">
              <h2>{reason === "Revision requested" ? "Request a quotation revision" : "Decline this quotation"}</h2>
              <label style={formLabel}>
                Response reason
                <select value={reason} onChange={(event) => setReason(event.target.value)} style={formInput}>
                  <option value="">Select a reason</option>
                  <option>Price</option>
                  <option>Delivery Time</option>
                  <option>Specification</option>
                  <option>Competitor</option>
                  <option>Requirement Cancelled</option>
                  <option>Revision requested</option>
                  <option>Other</option>
                </select>
              </label>
              <label style={formLabel}>
                Comments
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} style={{ ...formInput, minHeight: 90, resize: "vertical" }} placeholder="Add any details that will help us respond" />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button type="button" disabled={submitting} onClick={() => setShowResponseForm(false)} style={secondaryButton}>Cancel</button>
                <button
                  type="button"
                  disabled={submitting || !reason}
                  onClick={() => respond(reason === "Revision requested" ? "revision" : "reject")}
                  style={primaryButton}
                >
                  {submitting ? "Saving…" : reason === "Revision requested" ? "Send Revision Request" : "Confirm Decline"}
                </button>
              </div>
            </section>
          )}

          {terminal && (
            <div role="status" style={responseStatus}>
              Your response has been recorded: <strong>{proposal.status}</strong>
              {proposal.response_reason && <div>Reason: {proposal.response_reason}</div>}
              {proposal.response_comment && <div>Comments: {proposal.response_comment}</div>}
            </div>
          )}
          {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
        </section>
      </div>

      <footer style={actionBar} aria-label="Quotation actions">
        <button type="button" onClick={downloadPdf} style={downloadButton}>Download PDF</button>
        {!terminal && <>
          <button type="button" disabled={submitting} onClick={() => respond("accept")} style={primaryButton}>✓ Accept Quotation</button>
          <button type="button" disabled={submitting} onClick={() => { setReason(""); setComment(""); setShowResponseForm(true); }} style={secondaryButton}>✕ Reject Quotation</button>
          <button type="button" disabled={submitting} onClick={() => { setReason("Revision requested"); setComment(""); setShowResponseForm(true); }} style={secondaryButton}>Request Revision</button>
        </>}
      </footer>
    </main>
  );
}

const shell = {
  height: "100dvh", minHeight: "100vh", display: "flex", flexDirection: "column",
  overflow: "hidden", background: "#eef3ef", color: "#18251d",
  fontFamily: "Inter, system-ui, sans-serif",
};
const scrollArea = { flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "clamp(12px, 3vw, 30px) 14px 18px" };
const documentCard = { width: "min(100%, 1040px)", boxSizing: "border-box", margin: "0 auto", padding: "clamp(16px, 3vw, 32px)", background: "#fff", border: "1px solid #dce5df", borderRadius: 14, boxShadow: "0 8px 30px rgba(23,35,27,.08)", overflow: "hidden" };
const errorCard = { width: "min(100% - 28px, 760px)", margin: "32px auto", padding: 24, boxSizing: "border-box", background: "#fff", borderRadius: 14 };
const documentHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", paddingBottom: 18, borderBottom: "1px solid #dce5df" };
const brandGroup = { display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: "1 1 540px" };
const brandLogo = { width: 74, height: 60, objectFit: "contain", flex: "0 0 auto" };
const brand = { color: "#174c31", fontSize: "clamp(17px, 2vw, 22px)", fontWeight: 850, letterSpacing: ".025em", overflowWrap: "anywhere" };
const companyMeta = { color: "#536157", fontSize: 12, lineHeight: 1.55, overflowWrap: "anywhere" };
const statusPill = { padding: "6px 11px", borderRadius: 999, background: "#edf7ef", color: "#176338", fontSize: 12, fontWeight: 750, whiteSpace: "nowrap" };
const titleBlock = { padding: "18px 0 12px", overflowWrap: "anywhere" };
const customerDetails = { display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 10, color: "#46534a", fontSize: 13, overflowWrap: "anywhere" };
const previewHeading = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #e4e9e5", fontSize: 13 };
const quotationSheet = { border: "1px solid #d7dfd9", borderRadius: 8, padding: "clamp(12px, 2.5vw, 24px)", overflow: "hidden", overflowWrap: "anywhere", background: "#fff" };
const quotationMeta = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 18px", padding: "0 0 14px", borderBottom: "1px solid #dfe6e1", fontSize: 13 };
const itemTableScroll = { maxWidth: "100%", overflowX: "auto", overscrollBehaviorX: "contain", border: "1px solid #d9e1dc", borderRadius: 6 };
const itemTable = { width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 12 };
const totalsWrap = { width: "min(100%, 430px)", margin: "14px 0 0 auto", border: "1px solid #d9e1dc", borderRadius: 6, overflow: "hidden", fontSize: 13 };
const grandTotalRow = { background: "#edf7ef", fontWeight: 800, fontSize: 14 };
const termsBlock = { marginTop: 20, overflowWrap: "anywhere" };
const quotationFooter = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 20, marginTop: 28, paddingTop: 16, borderTop: "1px solid #dfe6e1", fontSize: 12, lineHeight: 1.7, overflowWrap: "anywhere" };
const responseForm = { marginTop: 18, padding: "clamp(14px, 2.5vw, 22px)", border: "1px solid #dce4df", borderRadius: 10, background: "#fbfcfb", overflowWrap: "anywhere" };
const responseStatus = { marginTop: 18, padding: 16, borderRadius: 10, background: "#edf7ef", lineHeight: 1.6, overflowWrap: "anywhere" };
const formLabel = { display: "block", marginBottom: 12, fontWeight: 700, fontSize: 13 };
const formInput = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #ccd5cf", borderRadius: 6, font: "inherit", background: "#fff" };
const primaryButton = { minHeight: 44, border: 0, borderRadius: 9, background: "#166534", color: "#fff", padding: "11px 16px", fontWeight: 750, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "#fff", color: "#8a241d", border: "1px solid #d7aaa6" };
const downloadButton = { ...primaryButton, background: "#eff6f0", color: "#174c31", border: "1px solid #c5d9ca" };
const actionBar = { flex: "0 0 auto", display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "12px clamp(12px, 3vw, 28px)", borderTop: "1px solid #d4ded7", background: "rgba(255,255,255,.97)", boxShadow: "0 -5px 18px rgba(23,35,27,.08)", zIndex: 5 };
const responsiveStyles = `
  button:disabled { opacity: .58; cursor: wait !important; }
  .quotation-meta > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .quotation-table th, .quotation-table td { padding: 9px 8px; border-bottom: 1px solid #dfe6e1; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .quotation-table th { background: #1a5c38; color: #fff; font-size: 11px; white-space: nowrap; }
  .quotation-table td { color: #27342b; }
  .quotation-table tbody tr:nth-child(even) { background: #f7faf8; }
  .quotation-totals > div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; border-bottom: 1px solid #e3e9e5; }
  .quotation-totals > div:last-child { border-bottom: 0; }
  .quotation-terms dl { margin: 8px 0 0; }
  .quotation-terms dl > div { display: grid; grid-template-columns: minmax(115px, 24%) minmax(0, 1fr); gap: 12px; padding: 6px 0; border-bottom: 1px solid #edf0ee; }
  .quotation-terms dt { font-weight: 700; }
  .quotation-terms dd { margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 640px) {
    .quotation-meta { grid-template-columns: minmax(0, 1fr) !important; }
    .quotation-footer { grid-template-columns: minmax(0, 1fr) !important; }
    .quotation-footer > div:last-child { text-align: left !important; }
    .quotation-table { min-width: 720px; }
    .quotation-terms dl > div { grid-template-columns: minmax(96px, 33%) minmax(0, 1fr); gap: 8px; }
  }
  @media (max-width: 430px) {
    .quotation-brand-logo { width: 54px !important; height: 48px !important; }
    .quotation-table { min-width: 690px; }
  }
`;

function getQuotationTotals(items, gstPercent, value) {
  if (items.length) {
    return items.reduce((summary, item) => {
      const qty = Math.max(0, Number(item.qty || item.quantity || 0));
      const rate = Math.max(0, Number(item.unitPrice || item.unit_price || 0));
      const discount = Math.min(100, Math.max(0, Number(item.discount || 0)));
      const taxable = qty * rate * (1 - discount / 100);
      const gst = taxable * Math.max(0, Number(item.gst ?? gstPercent ?? 0)) / 100;
      return { subtotal: summary.subtotal + taxable, gst: summary.gst + gst, total: summary.total + taxable + gst };
    }, { subtotal: 0, gst: 0, total: 0 });
  }
  const subtotal = Math.max(0, Number(value || 0));
  const gst = subtotal * Math.max(0, Number(gstPercent || 0)) / 100;
  return { subtotal, gst, total: subtotal + gst };
}
