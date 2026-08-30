"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, badgeStyle } from "./dashboard-styles";

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
  const [products, setProducts] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [captioning, setCaptioning] = useState(false);
  const [captionMsg, setCaptionMsg] = useState("");

  async function captionImages() {
    setCaptioning(true);
    setCaptionMsg("");
    try {
      const res = await fetch("/api/admin/products/caption-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json();
      setCaptionMsg(
        data.queued > 0
          ? `Captioning ${data.queued} product photo(s) in the background — refresh in a bit.`
          : "Every product with a photo is already captioned."
      );
    } catch {
      setCaptionMsg("Couldn't start captioning — try again.");
    } finally {
      setCaptioning(false);
    }
  }

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
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Product Catalog</h2>
      <p style={subtleTextStyle}>
        Every product extracted from this client&apos;s crawled site — kept current automatically on every
        recrawl, no chat/LLM call needed to browse it.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button onClick={captionImages} disabled={captioning} style={{ fontSize: 12, padding: "6px 10px" }}>
          {captioning ? "Starting…" : "Caption product images"}
        </button>
        <span style={{ ...subtleTextStyle, marginTop: 0 }}>
          Lets a customer&apos;s own photo be matched to a product — see each row&apos;s photo below.
          {captionMsg && <> {captionMsg}</>}
        </span>
      </div>

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
        <p style={subtleTextStyle}>{search ? "No products match that search." : "No products synced yet."}</p>
      )}

      {products && products.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {products.map((p) => (
            <div
              key={p.id}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, background: "var(--surface)" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 120,
                    borderRadius: 6,
                    background: "var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "var(--text-faint)",
                  }}
                >
                  No image
                </div>
              )}

              <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{p.name}</strong>

              {p.price && <div style={{ fontSize: 14, fontWeight: 600 }}>৳ {p.price}</div>}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.stock && (
                  <span style={badgeStyle(/out/i.test(p.stock) ? "error" : "ok")}>{p.stock}</span>
                )}
                {p.sku && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>SKU: {p.sku}</span>}
              </div>

              {p.description && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                  {p.description}
                </p>
              )}

              {p.sourceUrl && (
                <a href={p.sourceUrl.split("#")[0]} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                  View on site →
                </a>
              )}
            </div>
          ))}
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
