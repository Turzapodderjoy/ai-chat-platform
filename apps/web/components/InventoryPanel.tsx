"use client";

import { useEffect, useRef, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, badgeStyle, primaryButtonStyle } from "./dashboard-styles";

interface Product {
  id: string;
  name: string;
  price: string | null;
  costPrice: string | null;
  tier: string;
  description: string | null;
  stock: string | null;
  category: string | null;
  minStock: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sku: string | null;
  updatedAt: string;
}

const PAGE_SIZE = 25;
const EMPTY_DRAFT = { name: "", price: "", costPrice: "", tier: "regular", stock: "", sku: "", description: "", category: "", minStock: "0" };

/** A client's own inventory record -- manual add/edit/delete, or bulk
 * CSV/XLSX import, over the SAME Product table the (read-only) Product
 * Catalog panel shows from crawled-site sync. Separate tab from
 * Product Catalog on purpose (not the same panel with an edit mode):
 * Catalog is "what the AI/crawler found on your site", Inventory is
 * "your own stock record" -- a client managing inventory by hand
 * shouldn't have to wade through crawler-sourced rows to find their
 * own entries, and vice versa. Manually managed rows are NOT taught to
 * the AI chat (that stays crawl/upload-only via Knowledge Hub). */
export function InventoryPanel({ businessId }: { businessId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setProducts(null);
    const params = new URLSearchParams({
      businessId,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (search.trim()) params.set("search", search.trim());

    fetch(`/api/admin/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products);
        setTotal(data.total);
      });
  }

  useEffect(refresh, [businessId, search, offset]);

  async function addProduct() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...draft }),
      });
      if (res.ok) {
        setDraft(EMPTY_DRAFT);
        setShowAdd(false);
        refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditDraft({ name: p.name, price: p.price ?? "", costPrice: p.costPrice ?? "", tier: p.tier ?? "regular", stock: p.stock ?? "", sku: p.sku ?? "", description: p.description ?? "", category: p.category ?? "", minStock: String(p.minStock ?? 0) });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editDraft }),
      });
      if (res.ok) {
        setEditId(null);
        refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(p: Product) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await fetch(`/api/admin/products?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      setProducts((prev) => prev?.filter((x) => x.id !== p.id) ?? prev);
      setTotal((t) => Math.max(0, t - 1));
    } finally {
      setBusyId(null);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportMsg("");
    try {
      const form = new FormData();
      form.set("businessId", businessId);
      form.set("file", file);
      const res = await fetch("/api/admin/products/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(`Error: ${data.error ?? "import failed"}`);
        return;
      }
      setImportMsg(`Imported: ${data.created} added, ${data.updated} updated${data.skipped ? `, ${data.skipped} skipped` : ""}.`);
      refresh();
    } catch {
      setImportMsg("Couldn't import that file — check it's a valid CSV or .xlsx.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Inventory</h2>
      <p style={subtleTextStyle}>
        Your own stock record — add items by hand or import a CSV/XLSX file. Separate from Product Catalog
        (which only shows what&apos;s been found by crawling your site).
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <button onClick={() => setShowAdd((s) => !s)} style={primaryButtonStyle}>
          {showAdd ? "Cancel" : "+ Add product"}
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={{ fontSize: 12, padding: "6px 10px" }}>
          {importing ? "Importing…" : "Import CSV / XLSX"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
          }}
        />
      </div>
      {importMsg && <p style={{ ...subtleTextStyle, marginTop: 0 }}>{importMsg}</p>}

      {showAdd && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ padding: 8, minWidth: 160 }} />
          <input placeholder="Price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} style={{ padding: 8, width: 100 }} />
          <input placeholder="Unit cost price" value={draft.costPrice} onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })} style={{ padding: 8, width: 110 }} />
          <select value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })} style={{ padding: 8 }}>
            <option value="regular">Regular</option>
            <option value="premium">Premium</option>
          </select>
          <input placeholder="Stock qty" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} style={{ padding: 8, width: 100 }} />
          <input placeholder="Min stock" value={draft.minStock} onChange={(e) => setDraft({ ...draft, minStock: e.target.value })} style={{ padding: 8, width: 80 }} />
          <input placeholder="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={{ padding: 8, width: 120 }} />
          <input placeholder="SKU" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} style={{ padding: 8, width: 120 }} />
          <input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ padding: 8, flex: 1, minWidth: 180 }} />
          <button onClick={addProduct} disabled={saving || !draft.name.trim()} style={primaryButtonStyle}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          placeholder="Search by name, SKU, or description…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          style={{ padding: 8, flex: 1, maxWidth: 420 }}
        />
        <span style={{ ...subtleTextStyle, alignSelf: "center", marginTop: 0 }}>
          {total} product{total === 1 ? "" : "s"}
        </span>
      </div>

      {!products && <p style={subtleTextStyle}>Loading…</p>}
      {products && products.length === 0 && (
        <p style={subtleTextStyle}>{search ? "No products match that search." : "No inventory yet — add one or import a file."}</p>
      )}

      {products && products.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}></th>
                <th style={cellStyle}>Name</th>
                <th style={cellStyle}>SKU</th>
                <th style={cellStyle}>Category</th>
                <th style={cellStyle}>Tier</th>
                <th style={cellStyle}>Price</th>
                <th style={cellStyle}>Cost</th>
                <th style={cellStyle}>Stock</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) =>
                editId === p.id ? (
                  <tr key={p.id} style={{ background: "var(--surface)" }}>
                    <td style={cellStyle} colSpan={9}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <input placeholder="Name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} style={{ padding: 6, minWidth: 140 }} />
                        <input placeholder="Price" value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} style={{ padding: 6, width: 90 }} />
                        <input placeholder="Unit cost price" value={editDraft.costPrice} onChange={(e) => setEditDraft({ ...editDraft, costPrice: e.target.value })} style={{ padding: 6, width: 100 }} />
                        <select value={editDraft.tier} onChange={(e) => setEditDraft({ ...editDraft, tier: e.target.value })} style={{ padding: 6 }}>
                          <option value="regular">Regular</option>
                          <option value="premium">Premium</option>
                        </select>
                        <input placeholder="Stock qty" value={editDraft.stock} onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })} style={{ padding: 6, width: 90 }} />
                        <input placeholder="Min stock" value={editDraft.minStock} onChange={(e) => setEditDraft({ ...editDraft, minStock: e.target.value })} style={{ padding: 6, width: 80 }} />
                        <input placeholder="Category" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} style={{ padding: 6, width: 110 }} />
                        <input placeholder="SKU" value={editDraft.sku} onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })} style={{ padding: 6, width: 110 }} />
                        <input placeholder="Description" value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} style={{ padding: 6, flex: 1, minWidth: 160 }} />
                        <button onClick={() => saveEdit(p.id)} disabled={busyId === p.id} style={{ ...primaryButtonStyle, fontSize: 12 }}>
                          {busyId === p.id ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditId(null)} style={{ fontSize: 12 }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td style={cellStyle}>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt={p.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, background: "var(--surface)" }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--surface)" }} />
                      )}
                    </td>
                    <td style={cellStyle}>
                      <strong>{p.name}</strong>
                      {p.description && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{p.sku ?? "—"}</td>
                    <td style={cellStyle}>{p.category ?? "—"}</td>
                    <td style={cellStyle}>{p.tier === "premium" && <span style={badgeStyle("info")}>Premium</span>}</td>
                    <td style={cellStyle}>{p.price ? `$ ${p.price}` : "—"}</td>
                    <td style={{ ...cellStyle, color: "var(--text-faint)" }}>{p.costPrice ? `$ ${p.costPrice}` : "—"}</td>
                    <td style={cellStyle}>
                      {p.stock ? <span style={badgeStyle(/out/i.test(p.stock) ? "error" : "ok")}>{p.stock}</span> : "—"}
                      {p.stock && p.minStock > 0 && !/out/i.test(p.stock) && (() => {
                        const qty = parseInt(p.stock, 10);
                        if (!isNaN(qty) && qty <= p.minStock) {
                          return <div style={{ fontSize: 11, color: "var(--warning)", fontWeight: 500 }}>Low ({qty}/{p.minStock})</div>;
                        }
                        return null;
                      })()}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => startEdit(p)} disabled={busyId === p.id} style={{ fontSize: 11, padding: "4px 8px" }}>
                          Edit
                        </button>
                        <button onClick={() => deleteProduct(p)} disabled={busyId === p.id} style={{ fontSize: 11, padding: "4px 8px" }}>
                          {busyId === p.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {products && total > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
            ← Previous 25
          </button>
          <span style={subtleTextStyle}>
            Page {page} of {pageCount}
          </span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>
            Next 25 →
          </button>
        </div>
      )}
    </section>
  );
}
