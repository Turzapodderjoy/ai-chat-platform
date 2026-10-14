"use client";

import { useEffect, useRef, useState } from "react";

interface ModelCapabilities {
  fast?: boolean;
  reasoning?: boolean;
}

interface ModelPricing {
  input?: string;
  output?: string;
  free?: boolean;
}

interface OptionsPayload {
  providers: Array<{
    slug: string;
    name: string;
    models: string[];
    total_models?: number;
    authenticated?: boolean;
    free_tier_row?: boolean;
    warning?: string;
    pricing_pending?: boolean;
    unavailable_models?: string[];
    capabilities?: Record<string, ModelCapabilities>;
    pricing?: Record<string, ModelPricing>;
  }>;
}

interface SignInState {
  phase: "idle" | "waiting" | "done";
  link?: string;
  code?: string;
  message?: string;
}

interface ModelRow {
  provider: string;
  providerName: string;
  model: string;
  authenticated?: boolean;
  unavailable?: boolean;
  caps?: ModelCapabilities;
  pricing?: ModelPricing;
}

/**
 * Hermes-desktop-style model picker: searchable live catalog from the gateway
 * (/api/model/options), current-selection check, manual + auto refresh, and a
 * one-click Nous device-code sign-in when the catalog is guest-limited.
 */
export function ModelSelector({
  value,
  provider,
  slug,
  onChange,
}: {
  value: string | null;
  provider: string | null;
  slug: string;
  onChange: (model: string | null, provider: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OptionsPayload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sign, setSign] = useState<SignInState>({ phase: "idle" });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  async function load(refresh: boolean): Promise<void> {
    (refresh ? setRefreshing : setLoading)(true);
    try {
      const res = await fetch(
        `/api/admin/hermes-models?slug=${encodeURIComponent(slug)}${refresh ? "&refresh=1" : ""}`
      );
      const payload = (await res.json()) as OptionsPayload & { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error ?? "Failed to load models.");
      setData(payload);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      (refresh ? setRefreshing : setLoading)(false);
    }
  }

  // Open the panel → force the gateway to re-probe provider auth on the first
  // fetch (refresh=true), so a freshly authorized account shows up immediately
  // instead of serving the gateway's cached "signed out" catalog. After that,
  // keep it fresh while open (live, like Hermes) via plain cache reads.
  useEffect(() => {
    if (!open) return;
    void load(true);
    const t = setInterval(() => void load(false), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Poll the device-code flow until the portal approval lands (or expires).
  useEffect(() => {
    if (sign.phase !== "waiting") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/hermes-models?signin=1");
        const next = (await res.json()) as SignInState;
        if (next.phase !== "waiting") {
          setSign(next);
          if (next.phase === "done") void load(true);
        } else if (next.link) {
          setSign(next);
        }
      } catch {
        /* transient poll failure — keep trying */
      }
    }, 2_500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sign.phase]);

  async function startSignIn(): Promise<void> {
    try {
      const res = await fetch("/api/admin/hermes-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signin-start", slug }),
      });
      const next = (await res.json()) as SignInState & { error?: string };
      if (!res.ok || next.error) throw new Error(next.error ?? "Could not start sign-in.");
      setSign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const rows: ModelRow[] = [];
  for (const p of data?.providers ?? []) {
    const locked = new Set(p.unavailable_models ?? []);
    for (const m of p.models ?? []) {
      rows.push({
        provider: p.slug,
        providerName: p.name,
        model: m,
        authenticated: p.authenticated,
        unavailable: locked.has(m),
        caps: p.capabilities?.[m],
        pricing: p.pricing?.[m],
      });
    }
  }
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => `${r.model} ${r.provider} ${r.providerName}`.toLowerCase().includes(q))
    : rows;
  // Usable-without-credits models first — at $0 balance only free models answer.
  const ordered = [...filtered].sort(
    (a, b) => Number(b.pricing?.free === true) - Number(a.pricing?.free === true)
  );

  // The current value stays visible even when absent from the live catalog.
  const currentMissing =
    Boolean(value) && !rows.some((r) => r.model === value) && !filtered.some((r) => r.model === value);

  const nous = data?.providers?.find((p) => p.slug === "nous");
  const guestLimited = Boolean(nous && (nous.total_models ?? nous.models.length) <= 2);
  const total = rows.length;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        name={`aiva-model-selector-${slug}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model for agent ${slug}`}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 11px",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-sm)",
          color: value ? "var(--ink)" : "var(--ink-3)",
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            className="data"
            style={{
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value ?? "gateway default"}
          </span>
          {value && provider && (
            <span className="meta" style={{ flexShrink: 0 }}>{provider}</span>
          )}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--ink-3)", flexShrink: 0 }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 40,
            width: "min(520px, 90vw)",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-pop)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <label
            htmlFor={`model-search-${slug}`}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clipPath: "inset(50%)",
              whiteSpace: "nowrap",
            }}
          >
            Search models
          </label>
          <input
            id={`model-search-${slug}`}
            aria-label="Search models"
            autoFocus
            placeholder="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ fontSize: 13 }}
          />

          {error && <div className="field-error">{error}</div>}

          {nous?.warning && !guestLimited && <div className="meta">{nous.warning}</div>}
          {!nous?.warning && nous?.pricing_pending && (
            <div className="meta">
              Refreshing model prices — everything stays locked until pricing arrives.
            </div>
          )}

          {guestLimited && sign.phase !== "waiting" && (
            <div className="machine-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <span>
                <span className="lamp lamp-machine">Guest tier</span> only the welcome model. Sign
                in for the full free catalog.
              </span>
              <button
                type="button"
                className="machine sm"
                onClick={() => void startSignIn()}
                style={{ whiteSpace: "nowrap" }}
              >
                {sign.phase === "done" && !sign.message ? "Signed in" : "Sign in"}
              </button>
            </div>
          )}

          {sign.phase === "waiting" && (
            <div className="machine-block" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              {sign.link ? (
                <>
                  <a href={sign.link} target="_blank" rel="noreferrer" className="data">
                    {sign.link}
                  </a>
                  <span>
                    Enter code{" "}
                    <strong className="data" style={{ fontSize: 15 }}>
                      {sign.code}
                    </strong>
                  </span>
                  <span className="lamp lamp-machine">Waiting for approval</span>
                </>
              ) : (
                <span className="lamp lamp-machine">Starting sign-in</span>
              )}
            </div>
          )}

          {sign.phase === "done" && sign.message && <div className="meta">{sign.message}</div>}

          <div
            role="listbox"
            aria-label="Available models"
            style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column" }}
          >
            {loading && rows.length === 0 && <div className="meta">Loading models…</div>}
            {!loading && filtered.length === 0 && !currentMissing && (
              <div className="meta">Nothing matches “{query}”.</div>
            )}
            {currentMissing && value && (
              <Row
                row={{ provider: provider ?? "", providerName: provider ?? "", model: value }}
                current
                onClick={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
                title="Current model (not in catalog) — click to clear"
              />
            )}
            {ordered.map((r) => {
              const current = r.model === value;
              const blocked = r.unavailable === true;
              return (
                <Row
                  key={`${r.provider}/${r.model}`}
                  row={r}
                  current={current}
                  dim={blocked || r.authenticated === false}
                  blocked={blocked}
                  title={blocked ? "Requires Nous credits — not usable at $0 balance" : undefined}
                  onClick={() => {
                    onChange(r.model, r.provider);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              borderTop: "1px solid var(--line-soft)",
              paddingTop: 8,
            }}
          >
            <span className="meta">
              <span className="data">{loading ? "—" : total}</span> models
              {q ? ` / ${filtered.length} shown` : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {value && (
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                >
                  Use gateway default
                </button>
              )}
              <button
                type="button"
                className="sm"
                onClick={() => void load(true)}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh models"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  current,
  dim,
  blocked,
  onClick,
  title,
}: {
  row: ModelRow;
  current: boolean;
  dim?: boolean;
  blocked?: boolean;
  onClick: () => void;
  title?: string;
}) {
  const priced = row.pricing?.free !== true && (row.pricing?.input || row.pricing?.output);
  return (
    <button
      type="button"
      role="option"
      aria-selected={current}
      data-model={row.model}
      title={title ?? (dim ? `${row.provider} is not configured` : undefined)}
      onClick={() => {
        if (blocked) return;
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 8px",
        background: current ? "var(--accent-subtle)" : "transparent",
        border: "none",
        cursor: blocked ? "not-allowed" : "pointer",
        textAlign: "left",
        width: "100%",
        opacity: dim && !current ? 0.55 : 1,
      }}
    >
      <span style={{ width: 14, flexShrink: 0, color: "var(--accent)", display: "inline-flex" }}>
        {current && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
          </svg>
        )}
      </span>
      <span
        className="data"
        style={{
          fontSize: 12.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {row.model}
      </span>
      {row.caps?.reasoning && <Flag>think</Flag>}
      {row.caps?.fast && <Flag>fast</Flag>}
      {row.pricing?.free === true && <span className="lamp lamp-ok">Free</span>}
      {priced && (
        <span
          className="data"
          style={{ fontSize: 10.5, color: "var(--ink-3)", flexShrink: 0 }}
          title={`Paid — ${row.pricing?.input ?? "?"} in, ${row.pricing?.output ?? "?"} out, per million tokens`}
        >
          {row.pricing?.input ?? "?"}/{row.pricing?.output ?? "?"}
        </span>
      )}
      {row.authenticated === false && !blocked && <span className="lamp lamp-idle">No auth</span>}
      {blocked && <span className="lamp lamp-warn">Needs credits</span>}
      <span
        className="meta"
        style={{
          flexShrink: 0,
          maxWidth: 110,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.provider}
      </span>
    </button>
  );
}

// A capability note, not a status: quiet hairline chip, sentence case.
function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        color: "var(--ink-3)",
        border: "1px solid var(--line)",
        padding: "1px 5px",
        borderRadius: "var(--r-xs)",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}
