"use client";

import { useState } from "react";

export function UploadWidget({
  businessId,
  onUploaded,
}: {
  /** No fallback on purpose — a document has to belong to a real client.
   * The old "default" fallback here meant uploading from the mother
   * dashboard's combined (no single client selected) Knowledge Hub view
   * silently created documents under a businessId that matched no real
   * Business row and could never be found again from any client's own
   * dashboard. */
  businessId?: string;
  onUploaded?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function upload(file: File) {
    if (!businessId) return;

    setLoading(true);

    const form = new FormData();
    form.append("file", file);
    form.append("businessId", businessId);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      setMessage(JSON.stringify(data, null, 2));
      onUploaded?.();
    } finally {
      setLoading(false);
    }
  }

  if (!businessId) {
    return (
      <p style={{ opacity: 0.6, fontSize: 13 }}>
        Select a specific client's dashboard to upload documents — this
        combined view spans every client, so there&apos;s no single
        business to attach an upload to.
      </p>
    );
  }

  return (
    <div>
      <input
        type="file"
        disabled={loading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          upload(file);
        }}
      />

      {loading && <p style={{ opacity: 0.6 }}>Uploading…</p>}

      {message && (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{message}</pre>
      )}
    </div>
  );
}
