"use client";

import { useEffect, useRef, useState } from "react";

import { dataStyle } from "./dashboard-styles";
import { useCurrencySymbol } from "../lib/currency";
import { showConfirm } from "../lib/app-dialog";
import { RefillDialog, LotsDialog } from "./RefillDialog";

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
const EMPTY_DRAFT = { name: "", price: "", costPrice: "", tier: "regular", stock: "", sku: "", description: "", category: "", minStock: "" };

/** A client's own inventory record -- manual add/edit/delete, or bulk
 * CSV/XLSX import, over the SAME Product table the (read-only) Product
 * Catalog panel shows from crawled-site sync. Separate tab from
 * Product Catalog on purpose (not the same panel with an edit mode):
 * Catalog is "what the AI/crawler found on your site", Inventory is
 * "your own stock record" -- a client managing inventory by hand
 * shouldn't have to wade through crawler-sourced rows to find their
 * own entries, and vice versa. Manually managed rows are NOT taught to
 * the AI chat (that stays crawl/upload-only via Knowledge Hub). */
export function InventoryPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const currency = useCurrencySymbol(businessId);
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
  const [refillFor, setRefillFor] = useState<Product | null>(null);
  const [lotsFor, setLotsFor] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  function refreshSilent() {
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

  function refresh() {
    setProducts(null);
    refreshSilent();
  }

  // All dashboard tabs stay mounted (hidden via CSS, not unmounted) --
  // without refetching on becoming active, stock consumed by an order
  // in a different tab would never show up here until a full page
  // reload, even though the write itself is correct in the database.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) refresh(); }, [businessId, search, offset, active]);

  // Also keep polling while this tab stays the visible one -- an order
  // consuming stock without ever switching away from Inventory should
  // still show up without a manual reload. Silent (no "Loading…" flash)
  // since the table already has data to show.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refreshSilent, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, businessId, search, offset]);

  useEffect(() => {
    if (!active) return;
    fetch(`/api/admin/products/low-stock?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => setLowStockCount(data.count ?? 0))
      .catch(() => {});
    const interval = setInterval(() => {
      fetch(`/api/admin/products/low-stock?businessId=${encodeURIComponent(businessId)}`)
        .then((r) => r.json())
        .then((data) => setLowStockCount(data.count ?? 0))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [active, businessId]);

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
    setEditDraft({ name: p.name, price: p.price ?? "", costPrice: p.costPrice ?? "", tier: p.tier ?? "regular", stock: p.stock ?? "", sku: p.sku ?? "", description: p.description ?? "", category: p.category ?? "", minStock: p.minStock ? String(p.minStock) : "" });
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
    if (!(await showConfirm(`Delete "${p.name}"? This cannot be undone.`))) return;
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
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Inventory</span>
          <div className="meta">
            Your own stock record, added by hand or imported from a file. The Product Catalog tab is separate and only shows what the crawler found on your site.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "Importing file" : "Import CSV or XLSX"}
          </button>
          <button type="button" className="primary sm" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Close new part" : "Add part"}
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
            aria-label="Inventory import file"
          />
        </div>
      </div>

      <div className="panel-body">
        {lowStockCount > 0 && (
          <div className="panel-sunk" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="lamp lamp-warn">{lowStockCount} parts low</span>
            <span className="meta">Set a minimum stock per part to catch this automatically. The count refreshes every 10 seconds.</span>
          </div>
        )}

        {importMsg && <div className="meta" style={{ marginBottom: 12 }}>{importMsg}</div>}

        {showAdd && (
          <div className="panel-sunk" style={{ padding: 14, marginBottom: 14 }}>
            <div className="instrument-label" style={{ marginBottom: 10 }}>New part</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 10 }}>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-name">Name</label>
                <input id="inv-add-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-price">Sell price</label>
                <input
                  id="inv-add-price"
                  className="data"
                  type="number"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-cost">Unit cost price</label>
                <input
                  id="inv-add-cost"
                  className="data"
                  type="number"
                  inputMode="decimal"
                  value={draft.costPrice}
                  onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-tier">Tier</label>
                <select id="inv-add-tier" value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
                  <option value="regular">Regular</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-stock">Stock on hand</label>
                <input
                  id="inv-add-stock"
                  className="data"
                  type="number"
                  inputMode="numeric"
                  value={draft.stock}
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-min">Minimum stock</label>
                <input
                  id="inv-add-min"
                  className="data"
                  type="number"
                  inputMode="numeric"
                  value={draft.minStock}
                  onChange={(e) => setDraft({ ...draft, minStock: e.target.value })}
                />
                <div className="field-hint">Flags the part as low</div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-category">Category</label>
                <input id="inv-add-category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="inv-add-sku">SKU</label>
                <input
                  id="inv-add-sku"
                  className="data"
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="field-label" htmlFor="inv-add-description">Description</label>
                <input
                  id="inv-add-description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="primary" onClick={addProduct} disabled={saving || !draft.name.trim()}>
                {saving ? "Saving part" : "Save part"}
              </button>
            </div>
          </div>
        )}

        <div className="toolbar" style={{ marginBottom: 10 }}>
          <div className="field" style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 0 }}>
            <label className="field-label" htmlFor="inv-search">Search parts</label>
            <input
              id="inv-search"
              type="search"
              name="aiva-search-inventory"
              autoComplete="off"
              placeholder="Name, SKU, description"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <span className="meta" style={{ alignSelf: "flex-end", paddingBottom: 9 }}>
            {total} part{total === 1 ? "" : "s"}, amounts in {currency}
          </span>
        </div>

        {!products && <p className="meta">Loading inventory</p>}

        {products && products.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">
              {search ? "No parts match that search" : "No inventory yet"}
            </span>
            <span className="empty-state-description">
              {search ? "Clear the search box to see every part." : "Add your first part above, or import a CSV or XLSX file."}
            </span>
          </div>
        )}

        {products && products.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Part</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Tier</th>
                  <th className="num" style={{ textAlign: "right" }}>Price</th>
                  <th className="num" style={{ textAlign: "right" }}>Cost</th>
                  <th>Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) =>
                  editId === p.id ? (
                    <tr key={p.id}>
                      <td colSpan={9} style={{ background: "var(--panel-sunk)", padding: 14 }}>
                        <div className="instrument-label" style={{ marginBottom: 10 }}>
                          Edit {p.name}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 10 }}>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-name">Name</label>
                            <input id="inv-edit-name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-price">Sell price</label>
                            <input
                              id="inv-edit-price"
                              className="data"
                              type="number"
                              inputMode="decimal"
                              value={editDraft.price}
                              onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-cost">Unit cost price</label>
                            <input
                              id="inv-edit-cost"
                              className="data"
                              type="number"
                              inputMode="decimal"
                              value={editDraft.costPrice}
                              onChange={(e) => setEditDraft({ ...editDraft, costPrice: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-tier">Tier</label>
                            <select id="inv-edit-tier" value={editDraft.tier} onChange={(e) => setEditDraft({ ...editDraft, tier: e.target.value })}>
                              <option value="regular">Regular</option>
                              <option value="premium">Premium</option>
                            </select>
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-stock">Stock on hand</label>
                            <input
                              id="inv-edit-stock"
                              className="data"
                              type="number"
                              inputMode="numeric"
                              value={editDraft.stock}
                              onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-min">Minimum stock</label>
                            <input
                              id="inv-edit-min"
                              className="data"
                              type="number"
                              inputMode="numeric"
                              value={editDraft.minStock}
                              onChange={(e) => setEditDraft({ ...editDraft, minStock: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-category">Category</label>
                            <input id="inv-edit-category" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} />
                          </div>
                          <div className="field">
                            <label className="field-label" htmlFor="inv-edit-sku">SKU</label>
                            <input
                              id="inv-edit-sku"
                              className="data"
                              value={editDraft.sku}
                              onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })}
                            />
                          </div>
                          <div className="field" style={{ gridColumn: "1 / -1" }}>
                            <label className="field-label" htmlFor="inv-edit-description">Description</label>
                            <input
                              id="inv-edit-description"
                              value={editDraft.description}
                              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                            />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                          <button type="button" className="ghost" onClick={() => setEditId(null)}>Cancel</button>
                          <button type="button" className="primary" onClick={() => saveEdit(p.id)} disabled={busyId === p.id}>
                            {busyId === p.id ? "Saving part" : "Save part"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td style={{ width: 56 }}>
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt={p.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "var(--r-xs)", border: "1px solid var(--line)", background: "var(--panel-sunk)" }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: "var(--r-xs)", background: "var(--panel-sunk)" }} />
                        )}
                      </td>
                      <td>
                        <span style={{ color: "var(--ink)", fontWeight: 600 }}>{p.name}</span>
                        {p.description && (
                          <div className="meta" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td className="data" style={{ fontSize: 12 }}>{p.sku ?? <span className="meta">—</span>}</td>
                      <td>{p.category ?? <span className="meta">Uncategorised</span>}</td>
                      <td>
                        {p.tier === "premium" ? (
                          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Premium</span>
                        ) : (
                          <span className="meta">Regular</span>
                        )}
                      </td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>
                        {p.price ? `${currency}${p.price}` : <span className="meta">—</span>}
                      </td>
                      <td className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                        {p.costPrice ? `${currency}${p.costPrice}` : <span className="meta">—</span>}
                      </td>
                      <td>
                        <StockLamp stock={p.stock} minStock={p.minStock} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(() => {
                            // Exhausted: nothing left (or "out of stock") -- the Refill button is the primary action.
                            const qty = p.stock !== null ? Number(p.stock) : NaN;
                            const exhausted = (Number.isFinite(qty) && qty <= 0) || (p.stock !== null && /out/i.test(p.stock));
                            return (
                              <button
                                type="button"
                                className={exhausted ? "primary sm" : "sm"}
                                onClick={() => setRefillFor(p)}
                                disabled={busyId === p.id}
                                title="Add a new lot: quantity, cost price and sell price"
                              >
                                Refill stock
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            className="sm"
                            onClick={() => setLotsFor(p)}
                            title="Every restock with its cost and sell price"
                          >
                            Restock lots
                          </button>
                          <button type="button" className="sm" onClick={() => startEdit(p)} disabled={busyId === p.id}>Edit</button>
                          <button
                            type="button"
                            className="ghost sm"
                            onClick={() => deleteProduct(p)}
                            disabled={busyId === p.id}
                            aria-label={`Delete ${p.name}`}
                            title={`Delete ${p.name}`}
                            style={{ color: "var(--danger)" }}
                          >
                            {busyId === p.id ? "Deleting" : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            )}
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
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button type="button" className="sm" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
              Previous 25
            </button>
            <span className="meta">
              Page <span className="data">{page}</span> of <span className="data">{pageCount}</span>
            </span>
            <button type="button" className="sm" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>
              Next 25
            </button>
          </div>
        )}
      </div>

      {refillFor && (
        <RefillDialog
          product={refillFor}
          currency={currency}
          onClose={() => setRefillFor(null)}
          onDone={() => { setRefillFor(null); refresh(); }}
        />
      )}
      {lotsFor && <LotsDialog product={lotsFor} currency={currency} onClose={() => setLotsFor(null)} />}
    </section>
  );
}

/** Stock level as a lamp: out is err, at or under the minimum is warn,
 * anything else is ok. `stock` is free text upstream, so "out of stock"
 * counts as out. */
function StockLamp({ stock, minStock }: { stock: string | null; minStock: number }) {
  if (!stock) return <span className="meta">Not tracked</span>;
  if (/out/i.test(stock)) return <span className="lamp lamp-err">Out of stock</span>;
  const qty = Number(stock);
  if (Number.isFinite(qty) && minStock > 0 && qty <= minStock) {
    return <span className="lamp lamp-warn">{qty} left, minimum {minStock}</span>;
  }
  return <span className="lamp lamp-ok" style={dataStyle}>{stock} in stock</span>;
}