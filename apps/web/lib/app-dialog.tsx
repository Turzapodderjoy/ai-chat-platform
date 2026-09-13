"use client";

import { useEffect, useState } from "react";

import { primaryButtonStyle } from "../components/dashboard-styles";

type DialogState =
  | { kind: "alert"; message: string; resolve: () => void }
  | { kind: "confirm"; message: string; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; defaultValue: string; resolve: (value: string | null) => void }
  | null;

let setDialogState: ((s: DialogState) => void) | null = null;

/** In-app replacements for window.alert/confirm/prompt -- the browser's
 * own dialog chrome looks out of place next to the dashboard and is
 * blocked entirely in some embedded/automation contexts. Each resolves
 * once the rendered <AppDialogHost/> (mounted once in DashboardShell)
 * gets a click/keypress. */
export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    setDialogState?.({ kind: "alert", message, resolve: () => { resolve(); setDialogState?.(null); } });
  });
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    setDialogState?.({ kind: "confirm", message, resolve: (ok) => { resolve(ok); setDialogState?.(null); } });
  });
}

export function showPrompt(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    setDialogState?.({ kind: "prompt", message, defaultValue, resolve: (v) => { resolve(v); setDialogState?.(null); } });
  });
}

export function AppDialogHost() {
  const [state, setState] = useState<DialogState>(null);
  const [promptValue, setPromptValue] = useState("");

  useEffect(() => {
    setDialogState = setState;
    return () => { setDialogState = null; };
  }, []);

  useEffect(() => {
    if (state?.kind === "prompt") setPromptValue(state.defaultValue);
  }, [state]);

  if (!state) return null;
  const current = state;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => { if (current.kind === "alert") current.resolve(); }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md, 12px)", padding: 20, minWidth: 320, maxWidth: 440, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontSize: 14, color: "var(--text)", whiteSpace: "pre-wrap", marginBottom: 16, lineHeight: 1.5 }}>{current.message}</div>
        {current.kind === "prompt" && (
          <input
            autoFocus
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") current.resolve(promptValue);
              if (e.key === "Escape") current.resolve(null);
            }}
            style={{ width: "100%", padding: 8, marginBottom: 16, boxSizing: "border-box", fontFamily: "inherit" }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {current.kind !== "alert" && (
            <button
              onClick={() => (current.kind === "confirm" ? current.resolve(false) : current.resolve(null))}
              style={{ fontSize: 13, padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
          <button
            autoFocus={current.kind !== "prompt"}
            onClick={() => (current.kind === "alert" ? current.resolve() : current.kind === "confirm" ? current.resolve(true) : current.resolve(promptValue))}
            style={primaryButtonStyle}
          >
            {current.kind === "confirm" ? "Confirm" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
