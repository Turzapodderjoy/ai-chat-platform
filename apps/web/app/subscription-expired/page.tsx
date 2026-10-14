"use client";

import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function SubscriptionExpiredPage() {
  const router = useRouter();

  function logout() {
    document.cookie = "client_session=; path=/; max-age=0";
    router.push("/");
  }

  return (
    <main className="public-shell">
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.iconWrap}>
            <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>

          <h1 className={styles.title}>Subscription expired</h1>

          <p className={styles.sub}>
            Your subscription has expired. Contact support to renew and regain access to your dashboard.
          </p>

          <button onClick={logout} className={styles.button}>
            Sign out
          </button>

          <a href="mailto:optisuite10@gmail.com" className={styles.link}>
            Contact support
          </a>
        </div>
      </div>
    </main>
  );
}
