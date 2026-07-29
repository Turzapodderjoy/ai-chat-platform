"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle, formatBytes } from "./dashboard-styles";

interface StorageInfo {
  knowledgeChunks: number;
  knowledgeDocuments: number;
  knowledgeBytesEstimate: number;
  conversations: number;
  messages: number;
  crawlTargets: number;
  vectorStoreLocation: string;
  databaseLocation: string | null;
}

/** Shared by every per-client dashboard — one component, so it stays
 * accurate for every client without per-client code. */
export function StoragePanel({ businessId }: { businessId: string }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    fetch(`/api/admin/storage?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then(setInfo);
  }, [businessId]);

  if (!info) return <p>Loading…</p>;

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Storage</h2>
      <p style={{ opacity: 0.6 }}>
        Estimated size, not exact — the knowledge base is a shared JSON
        file today (filtered by this client's tag), so this is a
        per-record size estimate rather than a real disk quota.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={cellStyle}>Knowledge base size (est.)</td>
            <td style={cellStyle}>{formatBytes(info.knowledgeBytesEstimate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Indexed documents</td>
            <td style={cellStyle}>{info.knowledgeDocuments}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Chunks / vectors</td>
            <td style={cellStyle}>{info.knowledgeChunks}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Crawl targets registered</td>
            <td style={cellStyle}>{info.crawlTargets}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Conversations</td>
            <td style={cellStyle}>{info.conversations}</td>
          </tr>
          <tr>
            <td style={cellStyle}>Messages</td>
            <td style={cellStyle}>{info.messages}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Where it's stored</h3>
      <ul>
        <li>Knowledge base (documents, chunks, embeddings): {info.vectorStoreLocation}</li>
        <li>
          Conversations, messages, crawl targets, client record:{" "}
          {info.databaseLocation ?? "DATABASE_URL not set"}
        </li>
      </ul>
    </section>
  );
}
