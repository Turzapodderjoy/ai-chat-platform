"use client";

import { useEffect, useState, useCallback } from "react";

import { NavIcon } from "./nav-icons";

interface SearchResult {
  type: "conversation" | "repair" | "order" | "contact" | "product" | "invoice" | "staff";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  score?: number;
}

const TYPE_ICON: Record<SearchResult["type"], string> = {
  conversation: "allchats",
  repair: "repairs",
  order: "orders",
  contact: "contacts",
  product: "products",
  invoice: "invoices",
  staff: "staff",
};

export function GlobalSearchPanel({ businessId }: { businessId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/global-search?businessId=${encodeURIComponent(businessId)}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          style={{ color: "var(--ink-4)", flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="search"
          aria-label="Search conversations, repairs, orders, contacts and invoices"
          placeholder="Search conversations, repairs, orders, contacts… (⌘K)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{
            fontSize: 13,
            width: open ? 320 : 200,
            transition: "width var(--dur-state) ease",
          }}
          autoComplete="off"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }} className="ghost sm">Clear</button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            zIndex: 50,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-pop)",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {loading && (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton" style={{ height: 32 }} />
              <div className="skeleton" style={{ height: 32 }} />
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="empty-state" style={{ padding: "16px 14px" }}>
              <div className="empty-state-title">No results</div>
              <div className="empty-state-description">
                Nothing matches &ldquo;{query}&rdquo;. Try a customer name, order number or tracking
                token.
              </div>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {results.map((r) => (
                <a
                  key={`${r.type}-${r.id}`}
                  href={r.url}
                  className="plain-link"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--line-soft)",
                    textDecoration: "none",
                  }}
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setQuery(""); }}
                >
                  <span style={{ color: "var(--ink-3)", display: "flex", flexShrink: 0 }}>
                    <NavIcon id={TYPE_ICON[r.type]} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.title}
                    </span>
                    <span
                      className="meta"
                      style={{
                        display: "block",
                        fontSize: 11.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.subtitle}
                    </span>
                  </span>
                  <span className="data" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{r.type}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}