"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // There's no real authentication in this app (see CLAUDE.md) — this
  // screen is a cosmetic gate, not a credential check, so any submission
  // just continues into the dashboard rather than validating anything.
  function enter(e?: FormEvent) {
    e?.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    router.push("/dashboard");
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.35 8 12 11.82 4.65 8 12 4.18zM4 9.04l7 3.5V19.5l-7-3.5V9.04zm9 10.46v-6.96l7-3.5v6.96l-7 3.5z" />
            </svg>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        <div className={styles.card}>
          <form onSubmit={enter} noValidate>
            <div className={styles.formGroup}>
              <label htmlFor="email">Email address</label>
              <input type="email" id="email" name="email" placeholder="you@example.com" autoComplete="email" />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <input type="password" id="password" name="password" placeholder="Enter your password" autoComplete="current-password" />
            </div>

            <div className={styles.formRow}>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="remember" name="remember" />
                <label htmlFor="remember">Remember me</label>
              </div>
              <a href="#" className={styles.forgotLink} onClick={(e) => e.preventDefault()}>
                Forgot password?
              </a>
            </div>

            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <button type="button" className={styles.btnSecondary} onClick={() => enter()} disabled={submitting}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="7" height="7" rx="1" stroke="#6b7280" strokeWidth="2" />
              <rect x="14" y="3" width="7" height="7" rx="1" stroke="#6b7280" strokeWidth="2" />
              <rect x="3" y="14" width="7" height="7" rx="1" stroke="#6b7280" strokeWidth="2" />
              <rect x="14" y="14" width="7" height="7" rx="1" stroke="#6b7280" strokeWidth="2" />
            </svg>
            Sign in with SSO
          </button>
        </div>

        <p className={styles.footerText}>
          Don&apos;t have an account? <a href="#" onClick={(e) => e.preventDefault()}>Request access</a>
        </p>

        <p className={styles.legalText}>
          By signing in, you agree to our <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a> and{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}
