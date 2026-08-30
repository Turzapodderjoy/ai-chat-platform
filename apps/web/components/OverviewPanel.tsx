"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import { StatCard, StatCardRow } from "./StatCard";
import { cardStyle, labelTextStyle } from "./dashboard-styles";

interface BusinessKnowledgeStatus {
  businessId: string;
  businessName: string;
  crawlTargets: { total: number; done: number; stuck: number };
  documentCount: number;
  masterCsv: { updatedAt: string | null; sourceCount: number };
  lastRunAt: string | null;
}

interface ProviderStatus {
  name: string;
  healthy: boolean;
  hasUsableKey: boolean;
  maskedKey: string;
  enabled: boolean;
}

interface Counts {
  clients: number | null;
  openHandoffs: number | null;
  totalHandoffs: number | null;
  pendingSuggestions: number | null;
  qaUnprocessed: number | null;
  qaTotal: number | null;
  aiHealthy: number | null;
  aiTotal: number | null;
  embeddingHealthy: number | null;
  embeddingTotal: number | null;
}

const CHART_COLORS = {
  accent: "#6366f1",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  muted: "#475569",
};

function ProviderList({ providers }: { providers: ProviderStatus[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
      {providers.map((p) => (
        <div key={p.name} style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          background: "var(--surface-hover)",
          borderRadius: "var(--radius-xs, 6px)",
          fontSize: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: p.enabled && p.healthy ? "var(--success)" : p.enabled ? "var(--danger)" : "var(--text-faint)",
            }} />
            <span style={{ color: "var(--text)", fontWeight: 500, textTransform: "capitalize" }}>{p.name}</span>
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            {p.maskedKey || "No key"}
          </span>
        </div>
      ))}
      {providers.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>
          No providers configured
        </div>
      )}
    </div>
  );
}

export function OverviewPanel({ active = true }: { active?: boolean }) {
  const [counts, setCounts] = useState<Counts>({
    clients: null,
    openHandoffs: null,
    totalHandoffs: null,
    pendingSuggestions: null,
    qaUnprocessed: null,
    qaTotal: null,
    aiHealthy: null,
    aiTotal: null,
    embeddingHealthy: null,
    embeddingTotal: null,
  });
  const [knowledgeStatus, setKnowledgeStatus] = useState<BusinessKnowledgeStatus[] | null>(null);
  const [aiProviders, setAiProviders] = useState<ProviderStatus[]>([]);
  const [embeddingProviders, setEmbeddingProviders] = useState<ProviderStatus[]>([]);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllMessage, setRefreshAllMessage] = useState("");

  function refreshKnowledgeStatus() {
    fetch("/api/admin/knowledge/status-all")
      .then((r) => r.json())
      .then((d: { status: BusinessKnowledgeStatus[] }) => setKnowledgeStatus(d.status));
  }

  async function runRefreshAll() {
    setRefreshingAll(true);
    setRefreshAllMessage("Recrawling and rebuilding knowledge base for all clients...");
    try {
      await fetch("/api/admin/knowledge/refresh-all", { method: "POST" });
      const poll = setInterval(refreshKnowledgeStatus, 8000);
      setTimeout(() => {
        clearInterval(poll);
        setRefreshingAll(false);
        setRefreshAllMessage("");
        refreshKnowledgeStatus();
      }, 60000);
    } catch {
      setRefreshingAll(false);
      setRefreshAllMessage("Failed to start refresh.");
    }
  }

  useEffect(() => {
    if (!active) return;

    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, clients: d.clients.length })));

    fetch("/api/admin/handoffs")
      .then((r) => r.json())
      .then((d: { handoffs: { status: string }[] }) =>
        setCounts((c) => ({
          ...c,
          totalHandoffs: d.handoffs.length,
          openHandoffs: d.handoffs.filter((h) => h.status === "pending").length,
        }))
      );

    fetch("/api/admin/training/suggestions")
      .then((r) => r.json())
      .then((d) => setCounts((c) => ({ ...c, pendingSuggestions: d.pending.length })));

    fetch("/api/admin/qa-feedback")
      .then((r) => r.json())
      .then((d: { feedback: { processed: boolean }[] }) =>
        setCounts((c) => ({
          ...c,
          qaTotal: d.feedback.length,
          qaUnprocessed: d.feedback.filter((f) => !f.processed).length,
        }))
      );

    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d: { status: ProviderStatus[] }) => {
        setAiProviders(d.status);
        setCounts((c) => ({
          ...c,
          aiTotal: d.status.length,
          aiHealthy: d.status.filter((p) => p.enabled && p.healthy).length,
        }));
      });

    fetch("/api/admin/embedding-providers")
      .then((r) => r.json())
      .then((d: { status: ProviderStatus[] }) => {
        setEmbeddingProviders(d.status);
        setCounts((c) => ({
          ...c,
          embeddingTotal: d.status.length,
          embeddingHealthy: d.status.filter((p) => p.enabled && p.healthy).length,
        }));
      });

    refreshKnowledgeStatus();
  }, [active]);

  const val = (n: number | null) => (n === null ? "—" : String(n));

  const knowledgeChartData = knowledgeStatus?.slice(0, 6).map((s) => ({
    name: s.businessName.length > 10 ? s.businessName.slice(0, 10) + "…" : s.businessName,
    documents: s.documentCount,
    crawlTargets: s.crawlTargets.total,
  })) ?? [];

  const aiPieData = [
    { name: "Healthy", value: counts.aiHealthy ?? 0, color: CHART_COLORS.success },
    { name: "Unhealthy", value: (counts.aiTotal ?? 0) - (counts.aiHealthy ?? 0), color: CHART_COLORS.danger },
  ].filter((d) => d.value > 0);

  const embeddingPieData = [
    { name: "Healthy", value: counts.embeddingHealthy ?? 0, color: CHART_COLORS.success },
    { name: "Unhealthy", value: (counts.embeddingTotal ?? 0) - (counts.embeddingHealthy ?? 0), color: CHART_COLORS.danger },
  ].filter((d) => d.value > 0);

  return (
    <section>
      <StatCardRow>
        <StatCard label="Total Clients" value={val(counts.clients)} tone="accent" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>} />
        <StatCard label="Open Handoffs" value={val(counts.openHandoffs)} hint={counts.totalHandoffs !== null ? `${counts.totalHandoffs} total` : undefined} tone={counts.openHandoffs !== null && counts.openHandoffs > 0 ? "warning" : "success"} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>} />
        <StatCard label="AI Suggestions" value={val(counts.pendingSuggestions)} tone={counts.pendingSuggestions !== null && counts.pendingSuggestions > 0 ? "warning" : "success"} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" /></svg>} />
        <StatCard label="QA Pending" value={val(counts.qaUnprocessed)} hint={counts.qaTotal !== null ? `${counts.qaTotal} total` : undefined} tone={counts.qaUnprocessed !== null && counts.qaUnprocessed > 0 ? "warning" : "success"} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>} />
      </StatCardRow>

      {/* Knowledge Base Chart */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={labelTextStyle}>Knowledge Base Overview</div>
          <button onClick={runRefreshAll} disabled={refreshingAll} className="primary" style={{ fontSize: 12, padding: "6px 12px" }}>
            {refreshingAll ? "Refreshing..." : "Refresh All"}
          </button>
        </div>
        {refreshAllMessage && (
          <div style={{ padding: "10px 12px", background: "var(--accent-subtle)", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 12, color: "var(--accent)" }}>
            {refreshAllMessage}
          </div>
        )}
        {knowledgeChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={knowledgeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)", fontWeight: 500 }} />
              <Bar dataKey="documents" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} name="Documents" />
              <Bar dataKey="crawlTargets" fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} opacity={0.5} name="Crawl Targets" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state" style={{ height: 220 }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            <div className="empty-state-title">No knowledge base data</div>
            <div className="empty-state-description">Add clients and upload documents to see analytics here.</div>
          </div>
        )}
      </div>

      {/* Provider Health Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* AI Providers */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={labelTextStyle}>AI Providers</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {counts.aiHealthy ?? 0}/{counts.aiTotal ?? 0} healthy
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ flexShrink: 0 }}>
              {aiPieData.length > 0 ? (
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={aiPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={4} dataKey="value">
                      {aiPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" opacity={0.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProviderList providers={aiProviders} />
            </div>
          </div>
        </div>

        {/* Embedding Providers */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={labelTextStyle}>Embedding Providers</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {counts.embeddingHealthy ?? 0}/{counts.embeddingTotal ?? 0} healthy
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ flexShrink: 0 }}>
              {embeddingPieData.length > 0 ? (
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={embeddingPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={4} dataKey="value">
                      {embeddingPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" opacity={0.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProviderList providers={embeddingProviders} />
            </div>
          </div>
        </div>
      </div>

      {/* Client Knowledge Status Table */}
      <div style={cardStyle}>
        <div style={labelTextStyle}>Client Knowledge Status</div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Documents</th>
                <th>Crawl Targets</th>
                <th>Master CSV</th>
                <th>Last Refresh</th>
              </tr>
            </thead>
            <tbody>
              {knowledgeStatus?.map((s) => {
                const csvOk = s.masterCsv.updatedAt !== null && s.masterCsv.sourceCount >= s.documentCount;
                const targetsOk = s.crawlTargets.total === 0 || (s.crawlTargets.done === s.crawlTargets.total && s.crawlTargets.stuck === 0);
                return (
                  <tr key={s.businessId}>
                    <td style={{ fontWeight: 500, color: "var(--text)" }}>{s.businessName}</td>
                    <td>{s.documentCount}</td>
                    <td>
                      {s.crawlTargets.total === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <span style={{ color: targetsOk ? "var(--success)" : "var(--warning)" }}>
                          {s.crawlTargets.done}/{s.crawlTargets.total} done
                          {s.crawlTargets.stuck > 0 ? ` (${s.crawlTargets.stuck} stuck)` : ""}
                        </span>
                      )}
                    </td>
                    <td>
                      {s.masterCsv.updatedAt ? (
                        <span style={{ color: csvOk ? "var(--success)" : "var(--warning)" }}>
                          {s.masterCsv.sourceCount}/{s.documentCount} sources
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Not generated</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : "Never"}
                    </td>
                  </tr>
                );
              })}
              {knowledgeStatus && knowledgeStatus.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px" }}>No clients configured yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
