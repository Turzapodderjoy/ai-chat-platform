"use client";

import { useEffect, useState } from "react";

import { useCurrencySymbol } from "../lib/currency";

interface Product {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  stock: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sku: string | null;
  updatedAt: string;
}

const PAGE_SIZE = 25;

/** Per-client browsable product list — real columns, plain search, no
 * LLM call and no per-message token budget in the way (see
 * ProductSyncService's own comment on why this table exists at all).
 * Kept current automatically by every recrawl; this panel is read-only.
 * For manually adding/editing/importing inventory directly, see
 * InventoryPanel — a separate tab, same underlying Product table. */
export function ProductCatalogPanel({ businessId }: { businessId: string }) {
  const currency = useCurrencySymbol(businessId);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
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
  }, [businessId, search, offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <span className="instrument-label">Product catalog</span>
          <div className="meta">
            Every product attached to this client, kept current as orders and repairs are booked through the assistant. Read-only here: manage your own stock records in the Inventory tab.
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <div className="field" style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 0 }}>
            <label className="field-label" htmlFor="cat-search">Search catalog</label>
            <input
              id="cat-search"
              type="search"
              name="aiva-search-products"
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
            <span className="data">{total}</span> product{total === 1 ? "" : "s"}, prices in {currency}
          </span>
        </div>

        {!products && <p className="meta">Loading catalog</p>}

        {products && products.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">
              {search ? "No products match that search" : "No products synced yet"}
            </span>
            <span className="empty-state-description">
              {search
                ? "Clear the search box to see the whole catalog."
                : "Products appear here once the assistant books an order or repair that mentions them."}
            </span>
          </div>
        )}

        {products && products.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
            {products.map((p) => (
              <div key={p.id} className="panel-sunk" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: "var(--r-xs)", background: "var(--panel-sunk)" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 120,
                      borderRadius: "var(--r-xs)",
                      background: "var(--panel-sunk)",
                      border: "1px dashed var(--line)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "var(--ink-4)",
                    }}
                  >
                    No image
                  </div>
                )}

                <strong style={{ fontSize: 13, lineHeight: 1.3, color: "var(--ink)" }}>{p.name}</strong>

                {p.price && <div className="data" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{currency}{p.price}</div>}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {p.stock && (
                    /out/i.test(p.stock) ? (
                      <span className="lamp lamp-err">Out of stock</span>
                    ) : (
                      <span className="lamp lamp-ok">{p.stock} in stock</span>
                    )
                  )}
                  {p.sku && <span className="data" style={{ fontSize: 11 }}>{p.sku}</span>}
                </div>

                {p.description && (
                  <p className="meta" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                    {p.description}
                  </p>
                )}

                {p.sourceUrl && (
                  <a href={p.sourceUrl.split("#")[0]} target="_blank" rel="noreferrer" style={{ fontSize: 11, alignSelf: "flex-start" }}>
                    View on site
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {products && total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
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
    </section>
  );
}