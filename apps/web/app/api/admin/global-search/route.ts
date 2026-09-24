import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

function highlightMatch(text: string, query: string) {
  // Simple case-insensitive match highlight (could be enhanced)
  return text;
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!businessId || !q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const app = await getApp();
  const lowerQ = q.toLowerCase();
  const results: any[] = [];

  // Search conversations
  try {
    const convs = await app.container.router.handoff.list(businessId);
    for (const c of convs ?? []) {
      const haystack = `${c.sessionId} ${c.customerName ?? ""}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "conversation",
          id: c.sessionId,
          title: `${c.customerName ?? "Unknown"}`,
          subtitle: `${c.status ?? "bot"}`,
          url: `/dashboard/${businessId}?tab=allchats&conversation=${c.sessionId}`,
        });
      }
    }
  } catch {}

  // Search repairs
  try {
    const repairs = await app.container.router.repairs.listForBusiness(businessId);
    for (const r of repairs ?? []) {
      const haystack = `${r.id} ${r.trackingToken} ${r.customerName} ${r.phone} ${r.deviceType} ${r.deviceModel ?? ""} ${r.issueDescription} ${r.status}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "repair",
          id: r.id,
          title: `${r.customerName} — ${r.deviceType}${r.deviceModel ? ` ${r.deviceModel}` : ""}`,
          subtitle: `${r.trackingToken} • ${r.status}`,
          url: `/dashboard/${businessId}?tab=repairs&repair=${r.id}`,
        });
      }
    }
  } catch {}

  // Search contacts
  try {
    const contacts = await app.container.router.crm.listContacts(businessId);
    for (const c of contacts ?? []) {
      const haystack = `${c.id} ${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${c.companyName ?? ""}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "contact",
          id: c.id,
          title: c.name,
          subtitle: `${c.phone ?? "no phone"} ${c.email ? ` • ${c.email}` : ""} ${c.companyName ? ` • ${c.companyName}` : ""}`,
          url: `/dashboard/${businessId}?tab=contacts&contact=${c.id}`,
        });
      }
    }
  } catch {}

  // Search products
  try {
    const prods = await app.container.router.products.list(businessId, q, 0, 20);
    for (const p of prods.products ?? []) {
      const haystack = `${p.id} ${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "product",
          id: p.id,
          title: p.name,
          subtitle: `${p.category ?? "no category"} • ${p.stock ?? "no stock"} in stock`,
          url: `/dashboard/${businessId}?tab=products&product=${p.id}`,
        });
      }
    }
  } catch {}

  // Search invoices
  try {
    const invs = await app.container.router.revenue.listInvoices(businessId);
    for (const inv of invs ?? []) {
      const haystack = `${inv.id} ${inv.invoiceNumber}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "invoice",
          id: inv.id,
          title: `Invoice ${inv.invoiceNumber}`,
          subtitle: `${inv.status} • ${inv.amountPaid ?? 0}/${inv.total ?? 0}`,
          url: `/dashboard/${businessId}?tab=invoices&invoice=${inv.id}`,
        });
      }
    }
  } catch {}

  // Search staff
  try {
    const staff = await app.container.router.repairs.listStaff(businessId);
    for (const s of staff ?? []) {
      const haystack = `${s.id} ${s.name} ${s.email ?? ""} ${s.role}`.toLowerCase();
      if (haystack.includes(lowerQ)) {
        results.push({
          type: "staff",
          id: s.id,
          title: s.name,
          subtitle: `${s.role} • ${s.active ? "Active" : "Inactive"}`,
          url: `/dashboard/${businessId}?tab=staff&staff=${s.id}`,
        });
      }
    }
  } catch {}

  // Sort by relevance (simple: exact ID match first, then name starts with)
  results.sort((a, b) => {
    const aExact = a.id.toLowerCase() === lowerQ ? 0 : a.title.toLowerCase().startsWith(lowerQ) ? 1 : 2;
    const bExact = b.id.toLowerCase() === lowerQ ? 0 : b.title.toLowerCase().startsWith(lowerQ) ? 1 : 2;
    return aExact - bExact;
  });

  return NextResponse.json({ results: results.slice(0, 20) });
}