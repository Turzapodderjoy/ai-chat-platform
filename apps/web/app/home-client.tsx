"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function HomeClient() {
  const router = useRouter();

  // Strip credentials from URL if they leak into query params (e.g. shared
  // links with ?username=...&password=...). Never let them sit in the
  // address bar, browser history, or server logs.
  useEffect(() => {
    const url = new URL(window.location.href);
    const hasSensitiveParams = ["username", "password", "passwd", "pass"].some(
      (k) => url.searchParams.has(k)
    );
    if (hasSensitiveParams) {
      window.history.replaceState({}, "", url.pathname);
    }
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");

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
    <main className="public-shell">
      <div className={styles.page}>
        <div className={styles.card}>
          {/* Identity rail — what the agent does, as instrument readings */}
          <div className={styles.rail}>
            <div className={styles.mark}>
              <span className={styles.markGlyph} aria-hidden="true">AV</span>
              <span>
                <span className={styles.markName}>AIVA</span>
                <span className={styles.markSub}>SERVICE CONSOLE</span>
              </span>
            </div>

            <h1 className={styles.pitch}>Every customer conversation, answered.</h1>
            <p className={styles.pitchBody}>
              AIVA answers customers on WhatsApp, Messenger, Instagram and your website — for
              repair shops, retail and any service business — keeps one record per customer across
              every channel, and hands off to your team the moment a person is needed.
            </p>

            <div className={styles.readings}>
              <div className={styles.reading}>
                <span className={styles.readingKey}>Replies</span>
                <span className={styles.readingValue}>Instant, on your brand</span>
              </div>
              <div className={styles.reading}>
                <span className={styles.readingKey}>Handoff</span>
                <span className={styles.readingValueAmber}>To your team when it matters</span>
              </div>
              <div className={styles.reading}>
                <span className={styles.readingKey}>Records</span>
                <span className={styles.readingValue}>Orders, invoices, inventory, shifts</span>
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className={styles.formSide}>
            <div>
              <h2 className={styles.formTitle}>Sign in</h2>
              <p className={styles.formSub}>Use the credentials your business owner gave you.</p>
            </div>

            <form className={styles.form} onSubmit={enter} noValidate data-allow-autofill>
              {error && (
                <div className={`${styles.notice} ${styles.noticeError}`} role="alert" id="login-error">
                  {error}
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="username">Username</label>
                <input
                  className={styles.input}
                  type="text"
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">Password</label>
                <input
                  className={styles.input}
                  type="password"
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              <div className={styles.options}>
                <label className={styles.checkboxLabel} htmlFor="remember">
                  <input className={styles.checkbox} type="checkbox" id="remember" name="remember" />
                  Keep me signed in
                </label>
                <button
                  type="button"
                  className={styles.forgot}
                  onClick={() =>
                    setForgotMessage("Ask your business owner or the platform admin to reset your password.")
                  }
                >
                  Forgot password
                </button>
              </div>

              {forgotMessage && (
                <div className={`${styles.notice} ${styles.noticeInfo}`}>{forgotMessage}</div>
              )}

              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className={styles.legal}>
              By signing in you accept the{" "}
              <a href="/terms">terms of service</a>{" "}
              and the <a href="/privacy">privacy policy</a>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
