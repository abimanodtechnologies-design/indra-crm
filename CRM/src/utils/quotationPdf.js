import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import manodLogo from "../assets/manod-logo.jpg";

const calculateProposalTotals = ({ items = [], gstPercent = 18, value = 0 } = {}) => {
  const lines = Array.isArray(items) ? items : [];
  const pricedLines = lines.reduce((summary, item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    const rate = Math.max(0, Number(item.unitPrice || item.unit_price || 0));
    const discount = Math.min(100, Math.max(0, Number(item.discount || 0)));
    const taxable = qty * rate * (1 - discount / 100);
    const lineGst = taxable * Math.max(0, Number(item.gst ?? gstPercent ?? 0)) / 100;
    return { subtotal: summary.subtotal + taxable, gst: summary.gst + lineGst, total: summary.total + taxable + lineGst };
  }, { subtotal: 0, gst: 0, total: 0 });
  if (pricedLines.total > 0) return pricedLines;
  const subtotal = Math.max(0, Number(String(value || 0).replace(/[^0-9.-]/g, "")) || 0);
  const gst = subtotal * Math.max(0, Number(gstPercent ?? 0)) / 100;
  return { subtotal, gst, total: subtotal + gst };
};
export const downloadQuotationPdf = (proposal, returnData = false, logoData = manodLogo) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const items = Array.isArray(proposal?.quotation_items) ? proposal.quotation_items : [];
  const gst = Number(proposal?.gst_percent ?? 18);
  const totals = calculateProposalTotals({ items, gstPercent: gst, value: proposal?.value });
  const advancePercent = Math.min(100, Math.max(0, Number(proposal?.advance_percent ?? 30)));
  const finalPercent = 100 - advancePercent;
  const money = (amount) => Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const customerInfoRaw = proposal?.customerInfo || proposal?.customer_info || {};
  let customerInfo = customerInfoRaw;
  if (typeof customerInfoRaw === "string") {
    try { customerInfo = JSON.parse(customerInfoRaw || "{}"); } catch { customerInfo = {}; }
  }
  const customerName = proposal?.lead_name || proposal?.lead || "Customer";
  const maxTableBottom = 22;

  // Keep the letterhead and all variable customer/reference text within A4 margins.
  doc.addImage(logoData, "JPEG", margin, 10, 27, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INDRA ENGINEERING SERVICES", 119, 15, { align: "center", maxWidth: 135 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  ["No:16, VJ Complex,", "Vilankuruchi Road, Coimbatore-641035", "PH: 9047013803", "GSTIN: 33ADWPV5385L3ZE", "sales@coimbatorecnctools.com | www.coimbatorecnctools.com"]
    .forEach((line, index) => doc.text(line, 119, 21 + index * 4.5, { align: "center", maxWidth: 135 }));
  doc.setDrawColor(130, 140, 134);
  doc.line(margin, 58, pageWidth - margin, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("SALES QUOTATION", pageWidth / 2, 68, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const businessName = customerInfo.businessName || customerName;
  const contactLines = [customerInfo.contact, customerInfo.mobile, customerInfo.email].filter(Boolean).join(" | ");
  const addressLines = [customerInfo.location, customerInfo.address].filter(Boolean).join(", ");
  const customerBlock = [
    `To: ${customerName}`,
    `Business: ${businessName}`,
    contactLines && `Contact: ${contactLines}`,
    addressLines && `Address: ${addressLines}`,
  ].filter(Boolean).flatMap((line) => doc.splitTextToSize(String(line), 88));
  const referenceBlock = [
    `Quotation No: ${proposal?.quotation_no || proposal?.quotationNo || proposal?.id || "Draft"}`,
    `Date: ${new Date().toLocaleDateString("en-IN")}`,
    `Reference: ${proposal?.subject || "Quotation"}`,
  ].flatMap((line) => doc.splitTextToSize(String(line), 82));
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(customerBlock, margin, 79, { maxWidth: 88, lineHeightFactor: 1.25 });
  doc.setFont("helvetica", "normal");
  doc.text(referenceBlock, pageWidth - margin - 82, 79, { maxWidth: 82, lineHeightFactor: 1.25 });
  const infoLines = Math.max(customerBlock.length, referenceBlock.length);
  const introY = 79 + infoLines * 4 + 5;
  doc.setFontSize(9);
  doc.text("We thank you for your enquiry. Please find our quotation for the requested products.", margin, introY, { maxWidth: contentWidth });

  const rows = items.length ? items.map((item, index) => {
    const qty = Number(item.qty || 0);
    const rate = Number(item.unitPrice || item.unit_price || 0);
    const discount = Math.min(100, Math.max(0, Number(item.discount || 0)));
    const amount = qty * rate * (1 - discount / 100);
    const productText = [item.brand, item.product || item.productName || item.name].filter(Boolean).join(" - ");
    return [index + 1, `${productText || "Product"}${item.description || item.specification ? `\n${item.description || item.specification}` : ""}`, `${qty} ${item.unit || "Nos"}`, money(rate), `${discount}%`, money(amount)];
  }) : [[1, "Quoted products and services", "-", "-", "-", money(totals.subtotal)]];

  autoTable(doc, {
    startY: introY + 6,
    margin: { left: margin, right: margin, bottom: maxTableBottom },
    tableWidth: contentWidth,
    head: [["S.No", "Description", "Quantity", "Rate", "Dis %", "Amount"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [26, 92, 56], textColor: 255, fontSize: 8, halign: "center" },
    styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 70 },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 40, halign: "right" },
    },
    rowPageBreak: "avoid",
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    tableWidth: 100,
    margin: { left: pageWidth - margin - 100, right: margin, bottom: maxTableBottom },
    body: [
      ["Sub Total", money(totals.subtotal)],
      [`GST @ ${gst}%`, money(totals.gst)],
      ["Grand Total", money(totals.total)],
      [`Advance @ ${advancePercent}%`, money(totals.total * advancePercent / 100)],
      [`Balance @ ${finalPercent}%`, money(totals.total * finalPercent / 100)],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 62, halign: "right", fontStyle: "bold" }, 1: { cellWidth: 38, halign: "right" } },
    didParseCell: (data) => { if (data.row.index === 2) data.cell.styles.fontStyle = "bold"; },
  });

  let y = doc.lastAutoTable.finalY + 7;
  const defaultPaymentText = `${advancePercent}% advance payment with order confirmation and ${finalPercent}% balance payment before dispatch.`;
  const savedPaymentTerms = String(proposal?.payment_terms || "").trim();
  const additionalPaymentNote = /\d+(?:\.\d+)?\s*%/.test(savedPaymentTerms) ? "-" : (savedPaymentTerms || "-");
  const terms = [
    ["Delivery", "2-3 Weeks"],
    ["Price", "As quoted above"],
    ["Payment", defaultPaymentText],
    ["Additional payment note", additionalPaymentNote],
    ["Taxes", `GST @ ${gst}% as shown above`],
    ["Freight", "Not applicable unless otherwise agreed"],
    ["Validity", proposal?.due_date ? new Date(proposal.due_date).toLocaleDateString("en-IN") : "30 days"],
    ["Others", "-"],
  ].filter(([label]) => label !== "Additional payment note" || additionalPaymentNote !== "-");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (y > pageHeight - 55) { doc.addPage(); y = 18; }
  doc.text("Terms & Conditions for Sale", margin, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: margin, bottom: maxTableBottom },
    tableWidth: contentWidth,
    body: terms,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 0 }, overflow: "linebreak", valign: "top" },
    columnStyles: { 0: { cellWidth: 37, fontStyle: "bold" }, 1: { cellWidth: contentWidth - 37 } },
    rowPageBreak: "avoid",
  });

  y = doc.lastAutoTable.finalY + 8;
  if (y > pageHeight - 45) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Bank Account Details", margin, y);
  doc.setFont("helvetica", "normal");
  const bankLines = [
    "Beneficiary: INDRA ENGINEERING SERVICES",
    "Bank: Kotak Mahindra Bank",
    "Branch: Saravanampatti",
    "A/C No: 9360310006",
    "IFSC: KKBK0008673",
  ];
  bankLines.forEach((line, index) => doc.text(line, margin, y + 5 + index * 4.5, { maxWidth: 90 }));
  doc.setFont("helvetica", "bold");
  doc.text("For INDRA ENGINEERING SERVICES", pageWidth - margin, y + 2, { align: "right", maxWidth: 86 });
  doc.text("G. Vishnuvathanan", pageWidth - margin, y + 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("(9360318362)", pageWidth - margin, y + 18, { align: "right" });
  doc.text("(vishnu@coimbatorecnctools.com)", pageWidth - margin, y + 23, { align: "right", maxWidth: 86 });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("This is a computer-generated document", margin, pageHeight - 8);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  if (returnData) return doc.output("datauristring");
  doc.save(`quotation-${proposal?.id || "draft"}.pdf`);
};
