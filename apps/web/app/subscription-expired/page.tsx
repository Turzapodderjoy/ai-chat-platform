"use client";

import { useRouter } from "next/navigation";

export default function SubscriptionExpiredPage() {
  const router = useRouter();

  function logout() {
    document.cookie = "client_session=; path=/; max-age=0";
    router.push("/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 400,
          padding: 32,
          backgroundColor: "white",
          borderRadius: 12,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: "#fef2f2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <span style={{ fontSize: 32 }}>⚠️</span>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
          Subscription Expired
        </h1>

        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.5 }}>
          Your subscription has expired. Please contact support to renew your subscription and regain access.
        </p>

        <button
          onClick={logout}
          style={{
            padding: "10px 24px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
