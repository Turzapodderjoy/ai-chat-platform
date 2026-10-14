export interface SiteMapItem {
  id: string;
  label: string;
  badge?: number;
}

export interface SiteMapGroup {
  label?: string;
  items: SiteMapItem[];
}

export function SiteMapPanel({ groups, onSelect }: { groups: SiteMapGroup[]; onSelect: (id: string) => void }) {
  return (
    <div style={{ padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column", gap: 36 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>Home</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-3)" }}>One place for every section of this business.</p>
      </header>
      {groups.map((g, gi) => (
        <section key={gi}>
          {g.label ? (
            <h2 style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-3)", margin: 0 }}>{g.label}</h2>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
            {g.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelect(it.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", height: 56, borderRadius: "var(--r-lg)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)", fontSize: 13, fontWeight: 600, textAlign: "left", boxShadow: "none" }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                {it.badge ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)" }}>{it.badge > 100 ? "100+" : it.badge}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}