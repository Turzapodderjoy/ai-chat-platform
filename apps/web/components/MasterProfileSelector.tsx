"use client";

import { useEffect, useRef, useState } from "react";
import { useMasterProfile } from "../lib/master-profile";

export function MasterProfileSelector() {
  const { profileId, setProfileId, profile, profiles } = useMasterProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative" style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost btn-sm"
        style={{ gap: 6, alignItems: "center" }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select master profile"
      >
        <span style={{ fontSize: 12, opacity: 0.9 }}>Profile</span>
        <span style={{ fontWeight: 600 }}>{profile?.label ?? "Standard"}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.7 }}>
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="card"
          role="listbox"
          aria-label="Master profiles"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            minWidth: 240,
            padding: 6,
            boxShadow: "var(--shadow)",
          }}
        >
          {profiles.map((p: any) => {
            const active = p.id === profileId;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setProfileId(p.id);
                  setOpen(false);
                }}
                className="btn btn-ghost btn-sm"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    {active && (
                      <span style={{ fontSize: 11, opacity: 0.7 }} aria-hidden>
                        (active)
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.3 }}>{p.description}</span>
                </div>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 14 14" style={{ marginLeft: "auto", opacity: 0.8 }} aria-hidden>
                    <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
