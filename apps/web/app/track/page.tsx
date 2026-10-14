"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function TrackPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Enter your tracking code to continue.");
      return;
    }
    setError("");
    router.push(`/track/${trimmed.toUpperCase()}`);
  }

  return (
    <main className="public-shell">
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.mark}>
            <span className={styles.markGlyph} aria-hidden="true">AV</span>
            <span>
              <span className={styles.markName}>AIVA</span>
              <span className={styles.markSub}>SERVICE CONSOLE</span>
            </span>
          </div>

          <div className={styles.header}>
            <h1 className={styles.title}>Track your repair</h1>
            <p className={styles.sub}>
              Enter your tracking code to check the latest status for your repair.
            </p>
          </div>

          {error && (
            <div className={styles.error} role="alert" id="track-error">
              <span className={styles.errorTitle}>We couldn’t continue</span>
              <span>{error}</span>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tracking-code">
                Tracking code
              </label>
              <input
                id="tracking-code"
                className={styles.input}
                type="text"
                inputMode="text"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "track-error" : undefined}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value.toUpperCase());
                  if (error) setError("");
                }}
                placeholder="A1B2C3D4"
                autoFocus
                spellCheck={false}
              />
            </div>

            <button
              type="submit"
              className={styles.submit}
              disabled={!token.trim()}
            >
              Track repair
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
