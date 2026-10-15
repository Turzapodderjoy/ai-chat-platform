"use client";

import { useMasterProfile, MASTER_PROFILES, PLANNED_PROFILES } from "../lib/master-profile";
import { cardStyle, subtleTextStyle } from "./dashboard-styles";

// The home of master profiles: a card per available workspace shape plus
// the ones we haven't decided yet, so the whole profile surface is
// visible in one place (not just the quick switcher in the top bar).
export function ProfilesPanel() {
  const { profileId, setProfileId, profiles } = useMasterProfile();

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Profiles</h2>
      <p style={subtleTextStyle}>
        A profile is the shape of a workspace — which sections appear, which
        panel owns the screen, and what the dashboard opens on. Switch the
        active profile here; the top-bar switcher does the same thing.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {profiles.map((p) => {
          const active = p.id === profileId;
          return (
            <div
              key={p.id}
              style={{
                border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                background: "var(--panel)",
                borderRadius: "var(--r-md)",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{p.label}</span>
                {active ? (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--accent)",
                      background: "var(--accent-subtle)",
                      padding: "2px 6px",
                      borderRadius: 3,
                    }}
                  >
                    Active
                  </span>
                ) : null}
              </div>

              <p style={{ ...subtleTextStyle, margin: 0 }}>{p.description}</p>

              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    {f}
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {p.focusTabs.length > 0 ? `Focus: ${p.focusTabs.join(", ")}` : "Focus: none"}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={active}
                  onClick={() => setProfileId(p.id)}
                  style={{ marginLeft: "auto" }}
                >
                  {active ? "In use" : "Set active"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 4 }}>Not decided yet</h3>
      <p style={subtleTextStyle}>
        Shapes we plan to support. They&apos;ll become switchable once their
        sections are built out.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {PLANNED_PROFILES.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px dashed var(--line)",
              background: "var(--panel-sunk)",
              borderRadius: "var(--r-md)",
              padding: 14,
              opacity: 0.85,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-2)" }}>{p.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-3)" }}>
                Planned
              </span>
            </div>
            <p style={{ ...subtleTextStyle, margin: "6px 0 0" }}>{p.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
