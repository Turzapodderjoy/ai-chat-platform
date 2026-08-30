"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function HomeClient() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function enter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const remember = form.get("remember") === "on";

    if (!username || !password) {
      setError("Please enter both your username and password.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(data.admin ? "/dashboard" : `/dashboard/${data.businessId}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* Left branding panel */}
      <div className={styles.leftPanel}>
        <div className={styles.brandContent}>
          <div className={styles.brandIcon}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.35 8 12 11.82 4.65 8 12 4.18zM4 9.04l7 3.5V19.5l-7-3.5V9.04zm9 10.46v-6.96l7-3.5v6.96l-7 3.5z" />
            </svg>
          </div>
          <h1 className={styles.brandTitle}>AI Chat Platform</h1>
          <p className={styles.brandSubtitle}>
            Intelligent customer support powered by AI. Automate responses, 
            manage conversations, and delight your customers.
          </p>
          <div className={styles.features}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <span>AI-powered instant responses</span>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span>Multi-tenant business management</span>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </div>
              <span>Real-time analytics dashboard</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>Welcome back</h1>
            <p className={styles.formSubtitle}>Sign in to your account to continue</p>
          </div>

          <form className={styles.form} onSubmit={enter} noValidate>
            {error && <div className={styles.errorMessage}>{error}</div>}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="username">Username</label>
              <input
                className={styles.input}
                type="text"
                id="username"
                name="username"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input
                className={styles.input}
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className={styles.formOptions}>
              <div className={styles.checkboxGroup}>
                <input className={styles.checkbox} type="checkbox" id="remember" name="remember" />
                <label className={styles.checkboxLabel} htmlFor="remember">Remember me</label>
              </div>
              <a href="#" className={styles.forgotLink} onClick={(e) => e.preventDefault()}>
                Forgot password?
              </a>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className={styles.footer}>
            By signing in, you agree to our{" "}
            <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
