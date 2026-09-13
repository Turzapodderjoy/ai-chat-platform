import PDFDocument from "pdfkit";

import type { Invoice } from "./invoice-service";

export interface InvoicePdfContext {
  businessName: string;
  currencySymbol: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deviceLabel?: string;
}

/** Renders one Invoice as a single-page PDF for emailing to a customer
 * -- pdfkit draws directly (text/lines/rects) rather than going through
 * an HTML/CSS layout engine, so this has no headless-browser dependency
 * on the VPS. Kept deliberately simple: header, bill-to, a line-item
 * table, totals -- an invoice has no page-break-worthy content at this
 * app's scale. */
export function generateInvoicePdf(invoice: Invoice, ctx: InvoicePdfContext): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const money = (n: number) => `${ctx.currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  doc.fontSize(20).font("Helvetica-Bold").text(ctx.businessName, { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica").fillColor("#666").text("INVOICE", { align: "left" });
  doc.fillColor("#000");
  doc.moveDown(1);

  const topY = doc.y;
  doc.fontSize(11).font("Helvetica-Bold").text("Bill To", 50, topY);
  doc.font("Helvetica").fontSize(10);
  doc.text(ctx.customerName || "—", 50, doc.y + 2);
  if (ctx.customerPhone) doc.text(ctx.customerPhone);
  if (ctx.customerEmail) doc.text(ctx.customerEmail);
  if (ctx.deviceLabel) doc.text(ctx.deviceLabel);

  doc.font("Helvetica-Bold").fontSize(11).text("Invoice Number", 320, topY);
  doc.font("Helvetica").fontSize(10).text(invoice.invoiceNumber, 320, doc.y + 2);
  doc.font("Helvetica-Bold").fontSize(11).text("Issue Date", 320, doc.y + 8);
  doc.font("Helvetica").fontSize(10).text(new Date(invoice.issueDate).toLocaleDateString(), 320);
  if (invoice.dueDate) {
    doc.font("Helvetica-Bold").fontSize(11).text("Due Date", 320, doc.y + 8);
    doc.font("Helvetica").fontSize(10).text(new Date(invoice.dueDate).toLocaleDateString(), 320);
  }

  doc.moveDown(2);
  const tableTop = doc.y + 10;
  const col = { name: 50, qty: 320, unit: 390, total: 470 };
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Item", col.name, tableTop);
  doc.text("Qty", col.qty, tableTop);
  doc.text("Unit Price", col.unit, tableTop);
  doc.text("Amount", col.total, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor("#ccc").stroke();

  let y = tableTop + 22;
  doc.font("Helvetica").fontSize(10);
  for (const item of invoice.items) {
    doc.text(item.name, col.name, y, { width: 260 });
    doc.text(String(item.quantity), col.qty, y);
    doc.text(money(item.unitPrice), col.unit, y);
    doc.text(money(item.quantity * item.unitPrice), col.total, y);
    y += 20;
  }
  doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor("#ccc").stroke();
  y += 14;

  function totalsLine(label: string, value: string, bold = false) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10);
    doc.text(label, 380, y, { width: 100, align: "right" });
    doc.text(value, col.total, y);
    y += bold ? 20 : 16;
  }

  totalsLine("Subtotal", money(invoice.subtotal));
  if (invoice.discount) totalsLine("Discount", `-${money(invoice.discount)}`);
  if (invoice.tax) totalsLine("Tax", money(invoice.tax));
  totalsLine("Total", money(invoice.total), true);
  totalsLine("Paid", money(invoice.amountPaid));
  totalsLine("Balance Due", money(invoice.balanceDue), true);

  doc.moveDown(2);
  doc.font("Helvetica-Bold").fontSize(11).text(`Status: ${invoice.status.toUpperCase()}`, 50, y + 10);

  doc.end();
  return done;
}
