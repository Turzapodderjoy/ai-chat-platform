import PDFDocument from "pdfkit";

import type { Invoice } from "./invoice-service";

export interface InvoicePdfContext {
  businessName: string;
  currencySymbol: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deviceLabel?: string;
  // Same watermark the browser print page shows -- confirmed live, the
  // emailed PDF never drew it at all (this renderer and the print page
  // are two entirely separate code paths; fixing one never touched the
  // other). Fetched over HTTP rather than read from disk so this package
  // doesn't need to know apps/web's PERSISTENT_UPLOADS_DIR layout.
  logoUrl?: string | null;
}

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

/** Renders one Invoice as a single-page PDF for emailing to a customer
 * -- pdfkit draws directly (text/lines/rects) rather than going through
 * an HTML/CSS layout engine, so this has no headless-browser dependency
 * on the VPS. Kept deliberately simple: header, bill-to, a line-item
 * table, totals -- an invoice has no page-break-worthy content at this
 * app's scale. */
export async function generateInvoicePdf(invoice: Invoice, ctx: InvoicePdfContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const money = (n: number) => `${ctx.currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Watermark first, so every real element below paints on top of it, not
  // the other way around -- same "faint, centered, behind everything"
  // treatment as the browser print page's own watermark.
  if (ctx.logoUrl) {
    try {
      const res = await fetch(ctx.logoUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const size = 320;
        doc.opacity(0.06).image(buffer, (doc.page.width - size) / 2, (doc.page.height - size) / 2, { width: size });
        doc.opacity(1);
      }
    } catch {
      // A missing/unreachable logo is cosmetic, never worth failing the
      // whole invoice email over.
    }
  }

  doc.fontSize(22).font("Helvetica-Bold").fillColor("#111").text(ctx.businessName, PAGE_LEFT, PAGE_LEFT);
  doc.fontSize(10).font("Helvetica").fillColor("#888").text("INVOICE", PAGE_LEFT, doc.y + 2, { characterSpacing: 1 });

  doc.moveTo(PAGE_LEFT, doc.y + 14).lineTo(PAGE_RIGHT, doc.y + 14).lineWidth(2).strokeColor("#1a1a1a").stroke();
  doc.fillColor("#000");

  const topY = doc.y + 28;
  const infoColX = 340;
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("BILL TO", PAGE_LEFT, topY, { characterSpacing: 0.5 });
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#111").text(ctx.customerName || "—", PAGE_LEFT, doc.y + 4);
  doc.font("Helvetica").fontSize(10).fillColor("#444");
  if (ctx.customerPhone) doc.text(ctx.customerPhone, PAGE_LEFT);
  if (ctx.customerEmail) doc.text(ctx.customerEmail, PAGE_LEFT);
  if (ctx.deviceLabel) doc.text(ctx.deviceLabel, PAGE_LEFT);
  const billToBottom = doc.y;

  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("INVOICE NUMBER", infoColX, topY, { characterSpacing: 0.5 });
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#111").text(invoice.invoiceNumber, infoColX, doc.y + 4);
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("ISSUE DATE", infoColX, doc.y + 12, { characterSpacing: 0.5 });
  doc.fontSize(10).font("Helvetica").fillColor("#444").text(new Date(invoice.issueDate).toLocaleDateString(), infoColX, doc.y + 4);
  if (invoice.dueDate) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("DUE DATE", infoColX, doc.y + 10, { characterSpacing: 0.5 });
    doc.fontSize(10).font("Helvetica").fillColor("#444").text(new Date(invoice.dueDate).toLocaleDateString(), infoColX, doc.y + 4);
  }

  const tableTop = Math.max(billToBottom, doc.y) + 24;
  const col = { name: PAGE_LEFT, qty: 330, unit: 400, amount: 470 };
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#888");
  doc.text("ITEM", col.name, tableTop, { characterSpacing: 0.5 });
  doc.text("QTY", col.qty, tableTop, { width: 50, align: "right", characterSpacing: 0.5 });
  doc.text("UNIT PRICE", col.unit, tableTop, { width: 55, align: "right", characterSpacing: 0.5 });
  doc.text("AMOUNT", col.amount, tableTop, { width: 75, align: "right", characterSpacing: 0.5 });
  doc.moveTo(PAGE_LEFT, tableTop + 16).lineTo(PAGE_RIGHT, tableTop + 16).lineWidth(1).strokeColor("#ddd").stroke();

  let y = tableTop + 26;
  doc.font("Helvetica").fontSize(10).fillColor("#222");
  for (const item of invoice.items) {
    doc.text(item.name, col.name, y, { width: 270 });
    doc.text(String(item.quantity), col.qty, y, { width: 50, align: "right" });
    doc.text(money(item.unitPrice), col.unit, y, { width: 55, align: "right" });
    doc.text(money(item.quantity * item.unitPrice), col.amount, y, { width: 75, align: "right" });
    y += 22;
  }
  doc.moveTo(PAGE_LEFT, y + 2).lineTo(PAGE_RIGHT, y + 2).lineWidth(1).strokeColor("#ddd").stroke();
  y += 16;

  // Label and value each get their own non-overlapping column, both
  // right-aligned so every number's decimal point lines up -- confirmed
  // live in the previous layout, the label's box (x:380, width:100,
  // right-aligned) extended to x:480, past where the value column began
  // (x:470), rendering the two on top of each other.
  const totalsLabelX = 330;
  const totalsLabelWidth = 140;
  const totalsValueX = col.amount;
  const totalsValueWidth = 75;

  function totalsLine(label: string, value: string, bold = false) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(bold ? "#111" : "#555");
    doc.text(label, totalsLabelX, y, { width: totalsLabelWidth, align: "right" });
    doc.text(value, totalsValueX, y, { width: totalsValueWidth, align: "right" });
    y += bold ? 22 : 18;
  }

  totalsLine("Subtotal", money(invoice.subtotal));
  if (invoice.discount) totalsLine("Discount", `-${money(invoice.discount)}`);
  if (invoice.tax) totalsLine("Tax", money(invoice.tax));
  doc.moveTo(totalsLabelX, y).lineTo(PAGE_RIGHT, y).lineWidth(1).strokeColor("#ddd").stroke();
  y += 6;
  totalsLine("Total", money(invoice.total), true);
  totalsLine("Paid", money(invoice.amountPaid));
  totalsLine("Balance Due", money(invoice.balanceDue), true);

  const STATUS_COLOR: Record<string, string> = { paid: "#0a7c3f", partially_paid: "#a15c00", issued: "#1a56db", overdue: "#c0242c", void: "#666", draft: "#666" };
  doc.fontSize(11).font("Helvetica-Bold").fillColor(STATUS_COLOR[invoice.status] ?? "#111").text(`Status: ${invoice.status.replace(/_/g, " ").toUpperCase()}`, PAGE_LEFT, y + 14);

  doc.fontSize(9).font("Helvetica").fillColor("#999").text("Thank you for your business.", PAGE_LEFT, doc.page.height - 70, { width: PAGE_WIDTH, align: "center" });

  doc.end();
  return done;
}
