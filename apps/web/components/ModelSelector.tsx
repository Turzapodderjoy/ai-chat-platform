"use client";

import { useEffect, useRef, useState } from "react";

import { inputStyle, subtleTextStyle } from "./dashboard-styles";

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

  // Open the panel → initial fetch; keep it fresh while open (live, like Hermes).
  useEffect(() => {
    if (!open) return;
    void load(false);
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
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputStyle,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "9px 12px",
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 12.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: value ? "var(--text)" : "var(--text-muted)",
          }}
        >
          {value ?? "gateway default"}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>
          {value && provider ? `${provider} · ` : ""}▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 40,
            width: "min(520px, 90vw)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 12px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            autoFocus
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
          />

          {error && <div style={{ ...subtleTextStyle, color: "var(--danger, #d64545)", fontSize: 12 }}>{error}</div>}

          {nous?.warning && !guestLimited && (
            <div style={{ ...subtleTextStyle, fontSize: 12 }}>{nous.warning}</div>
          )}
          {!nous?.warning && nous?.pricing_pending && (
            <div style={{ ...subtleTextStyle, fontSize: 12 }}>
              Refreshing model prices — everything stays locked until pricing arrives.
            </div>
          )}

          {guestLimited && sign.phase !== "waiting" && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                background: "rgba(42,109,244,0.07)",
                border: "1px solid rgba(42,109,244,0.18)",
                borderRadius: 8,
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Guest tier: only the welcome model. Sign in for the full free catalog.</span>
              <button
                type="button"
                onClick={() => void startSignIn()}
                style={{
                  background: "var(--accent)",
                  borderColor: "var(--accent)",
                  color: "#fff",
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {sign.phase === "done" && !sign.message ? "Signed in ✓" : "Sign in"}
              </button>
            </div>
          )}

          {sign.phase === "waiting" && (
            <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
              {sign.link ? (
                <>
                  <a href={sign.link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    {sign.link}
                  </a>
                  <span>
                    Enter code: <strong style={{ fontFamily: "monospace", fontSize: 15 }}>{sign.code}</strong>
                  </span>
                  <span style={subtleTextStyle}>Waiting for approval…</span>
                </>
              ) : (
                <span style={subtleTextStyle}>Starting sign-in…</span>
              )}
            </div>
          )}

          {sign.phase === "done" && sign.message && (
            <div style={{ ...subtleTextStyle, fontSize: 12 }}>{sign.message}</div>
          )}

          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {loading && rows.length === 0 && <div style={subtleTextStyle}>Loading models…</div>}
            {!loading && filtered.length === 0 && !currentMissing && (
              <div style={subtleTextStyle}>No models match “{query}”.</div>
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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ ...subtleTextStyle, fontSize: 11.5, marginTop: 0 }}>
              {loading ? "Loading…" : `${total} models`}
              {q ? ` · ${filtered.length} shown` : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                  style={{
                    background: "transparent",
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  Gateway default
                </button>
              )}
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                }}
              >
                {refreshing ? "Refreshing…" : "↻ Refresh models"}
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
  return (
    <button
      type="button"
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
        background: current ? "rgba(42,109,244,0.12)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: blocked ? "not-allowed" : "pointer",
        textAlign: "left",
        width: "100%",
        opacity: dim && !current ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!current) e.currentTarget.style.background = "var(--surface-hover, rgba(127,127,127,0.1))";
      }}
      onMouseLeave={(e) => {
        if (!current) e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ width: 14, flexShrink: 0, color: "var(--accent)", fontSize: 12 }}>
        {current ? "✓" : ""}
      </span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 12.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {row.model}
      </span>
      {row.caps?.reasoning && <Chip>think</Chip>}
      {row.caps?.fast && <Chip>fast</Chip>}
      {row.pricing?.free === true && <Chip tone="ok">free</Chip>}
      {row.pricing?.free === false && (
        <Chip title={`Paid — ${row.pricing?.input ?? "?"}/M in, ${row.pricing?.output ?? "?"}/M out`}>$</Chip>
      )}
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          flexShrink: 0,
          maxWidth: 130,
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

function Chip({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone?: "ok";
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "2px 6px",
        borderRadius: 999,
        background:
          tone === "ok"
            ? "rgba(52,168,83,0.16)"
            : "var(--surface-hover, rgba(127,127,127,0.15))",
        color: tone === "ok" ? "var(--success, #34a853)" : "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}
