"use client";

import { useRouter } from "next/navigation";

export default function SubscriptionExpiredPage() {
  const router = useRouter();

  function logout() {
    document.cookie = "client_session=; path=/; max-age=0";
    router.push("/");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0b100e",
      fontFamily: "var(--font-geist-sans, -apple-system), BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        maxWidth: 420,
        width: "100%",
        padding: 40,
        background: "#151d19",
        borderRadius: 12,
        border: "1px solid #23312b",
        boxShadow: "0 20px 60px -12px rgba(0, 0, 0, 0.5)",
        textAlign: "center",
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "rgba(239, 68, 68, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#e9efec", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Subscription Expired
        </h1>

        <p style={{ fontSize: 14, color: "#a4b4ac", marginBottom: 28, lineHeight: 1.6 }}>
          Your subscription has expired. Please contact support to renew and regain access to your dashboard.
        </p>

        <button
          onClick={logout}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "#0d9488",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#0f766e";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#0d9488";
            e.currentTarget.style.transform = "none";
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
