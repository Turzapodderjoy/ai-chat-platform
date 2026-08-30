"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TrackPage() {
  const [token, setToken] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (token.trim()) {
      router.push(`/track/${token.trim().toUpperCase()}`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>Track Your Repair</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
          Enter your tracking code to check the status of your repair.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            placeholder="Tracking code (e.g. A1B2C3D4)"
            style={{
              padding: "14px 16px",
              fontSize: 18,
              textAlign: "center",
              letterSpacing: "0.1em",
              fontWeight: 600,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              color: "var(--text)",
              outline: "none",
            }}
            autoFocus
          />
          <button
            type="submit"
            disabled={!token.trim()}
            style={{
              padding: "14px 24px",
              fontSize: 15,
              fontWeight: 600,
              background: token.trim() ? "var(--accent)" : "var(--surface-hover)",
              color: token.trim() ? "white" : "var(--text-muted)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: token.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            Track Repair
          </button>
        </form>
      </div>
    </div>
  );
}
