"use client";

import { useEffect, useState, useCallback } from "react";

import { cardStyle, subtleTextStyle, badgeStyle } from "./dashboard-styles";

interface SearchResult {
  type: "conversation" | "repair" | "order" | "contact" | "product" | "invoice" | "staff";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  score?: number;
}

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

  function fmtType(t: SearchResult["type"]) {
    const icons: Record<string, string> = {
      conversation: "💬",
      repair: "🔧",
      order: "📦",
      contact: "👤",
      product: "📦",
      invoice: "🧾",
      staff: "👨‍🔧",
    };
    return icons[t] ?? "📄";
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder="Search conversations, repairs, orders, contacts… (⌘K)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
            width: open ? 320 : 200,
            transition: "width 0.15s",
            outline: "none",
          }}
          autoComplete="off"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }} style={{ padding: "6px 10px", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", color: "var(--text-muted)" }}>
            Clear
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, zIndex: 50, ...cardStyle, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: "1px solid var(--border)", maxHeight: 400, overflowY: "auto" }}>
          {loading && <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>Searching…</div>}
          {!loading && results.length === 0 && query.length >= 2 && <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>No results for "{query}"</div>}
          {!loading && results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {results.map((r) => (
                <a key={`${r.type}-${r.id}`} href={r.url} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textDecoration: "none", color: "inherit", transition: "background 0.1s" }} onClick={(e) => { e.stopPropagation(); setOpen(false); setQuery(""); }}>
                  <span style={{ fontSize: 16 }}>{fmtType(r.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.subtitle}</div>
                  </div>
                  <span style={badgeStyle("neutral")}>{r.type}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}