"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.css";

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessId = searchParams.get("businessId");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Check if Google Sign-In is enabled for this business
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/admin/google-signin?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((data) => {
        setGoogleEnabled(data.enabled === true && !!data.clientId);
      })
      .catch(() => {});
  }, [businessId]);

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

  function openGooglePopup() {
    if (!businessId) return;
    setGoogleLoading(true);
    setError("");

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/api/auth/google?businessId=${encodeURIComponent(businessId)}`,
      "google-signin",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    function onMessage(e: MessageEvent) {
      if (e.data && typeof e.data === "object" && "success" in e.data) {
        window.removeEventListener("message", onMessage);
        setGoogleLoading(false);
        if (e.data.success && e.data.businessId) {
          router.push(`/dashboard/${e.data.businessId}`);
        } else if (e.data.error) {
          setError(e.data.error);
        }
      }
    }

    window.addEventListener("message", onMessage);

    // Also detect if popup was blocked
    const checkPopup = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(checkPopup);
        window.removeEventListener("message", onMessage);
        setGoogleLoading(false);
      }
    }, 500);
  }

  return (
    <main className={styles.page}>
      {/* Left branding panel */}
      <div className={styles.leftPanel}>
        <div className={styles.brandContent}>
          <div className={styles.brandIcon}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="white" fillOpacity="0.2"/>
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className={styles.brandTitle}>AIVA</h1>
          <p className={styles.brandSubtitle}>
            AI-powered customer support platform. Automate responses, 
            manage conversations, and scale your business.
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

          {/* Google Sign-In button (only shown when businessId is in URL and enabled) */}
          {businessId && googleEnabled && (
            <>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={openGooglePopup}
                disabled={googleLoading}
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? "Signing in..." : "Sign in with Google"}
              </button>

              <div className={styles.divider}>
                <div className={styles.dividerLine} />
                <span className={styles.dividerText}>or</span>
                <div className={styles.dividerLine} />
              </div>
            </>
          )}

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
