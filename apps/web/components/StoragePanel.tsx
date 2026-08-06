"use client";

import { useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, formatBytes } from "./dashboard-styles";
import { StatCard, StatCardRow } from "./StatCard";

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

  if (!info) return <p style={subtleTextStyle}>Loading…</p>;

  return (
    <section>
      <h1 style={{ marginBottom: 4 }}>Storage</h1>
      <p style={subtleTextStyle}>What this client&apos;s knowledge base and chat history take up (estimated).</p>

      <div style={{ marginTop: 16 }}>
        <StatCardRow>
          <StatCard label="Knowledge base" value={formatBytes(info.knowledgeBytesEstimate)} hint={`${info.knowledgeDocuments} documents`} />
          <StatCard label="Chunks / vectors" value={String(info.knowledgeChunks)} />
          <StatCard label="Crawl targets" value={String(info.crawlTargets)} />
          <StatCard label="Conversations" value={String(info.conversations)} hint={`${info.messages} messages`} />
        </StatCardRow>
      </div>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Where it&apos;s stored</h3>
        <p style={{ fontSize: 13, marginBottom: 6 }}>Knowledge base: {info.vectorStoreLocation}</p>
        <p style={{ fontSize: 13, margin: 0 }}>
          Conversations &amp; messages: {info.databaseLocation ?? "DATABASE_URL not set"}
        </p>
      </section>
    </section>
  );
}
