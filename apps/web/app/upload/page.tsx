"use client";

import { useState } from "react";

export default function UploadPage() {
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    const form = new FormData();

    form.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: form,
    });

    const data = await res.json();

    setMessage(JSON.stringify(data, null, 2));
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Upload Knowledge File</h1>

      <input
        type="file"
        onChange={(e) => {
          if (!e.target.files?.length) return;

          upload(e.target.files[0]);
        }}
      />

      <pre>{message}</pre>
    </main>
  );
}