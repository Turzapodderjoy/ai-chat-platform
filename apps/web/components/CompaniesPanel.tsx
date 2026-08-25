"use client";

import { useEffect, useState } from "react";

import { cardStyle, cellStyle, subtleTextStyle, primaryButtonStyle, shortId } from "./dashboard-styles";

interface Company {
  id: string;
  businessId: string;
  name: string;
  domain: string | null;
  createdAt: string;
}

interface Client {
  id: string;
  name: string;
}

/** The organizations a client's own contacts work for — HubSpot's
 * Contacts-Companies-Deals structure: people (Contacts) belong to
 * organizations (Companies), which own the opportunities (Deals). */
export function CompaniesPanel({ businessId, active = true }: { businessId?: string; active?: boolean }) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [targetBusinessId, setTargetBusinessId] = useState(businessId ?? "");
  const [creating, setCreating] = useState(false);

  function refresh() {
    const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    fetch(`/api/admin/crm/companies${qs}`)
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies));
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, active]);

  // Only the mother dashboard (no businessId prop) needs a client
  // picker — a per-client dashboard already knows which business it's
  // creating a Company for.
  useEffect(() => {
    if (businessId) return;
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients));
  }, [businessId]);

  async function createCompany() {
    const targetId = businessId ?? targetBusinessId;
    if (!targetId || !name.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/admin/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: targetId, name, domain: domain || undefined }),
      });
      setName("");
      setDomain("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  async function deleteCompany(company: Company) {
    const confirmed = window.confirm(`Delete the company "${company.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await fetch(`/api/admin/crm/companies?id=${encodeURIComponent(company.id)}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Companies</h2>
      <p style={subtleTextStyle}>The organizations your contacts belong to — for B2B customers who order or repair on behalf of a business.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {!businessId && (
          <select value={targetBusinessId} onChange={(e) => setTargetBusinessId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select client…</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input style={{ padding: 8, minWidth: 180 }} placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={{ padding: 8, minWidth: 180 }} placeholder="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <button onClick={createCompany} disabled={creating || !name.trim() || (!businessId && !targetBusinessId)} style={primaryButtonStyle}>
          {creating ? "Creating…" : "+ Add company"}
        </button>
      </div>

      {!companies && <p style={subtleTextStyle}>Loading…</p>}
      {companies && companies.length === 0 && <p style={subtleTextStyle}>No companies yet.</p>}

      {companies && companies.length > 0 && (
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle}>ID</th>
                <th style={cellStyle}>Name</th>
                <th style={cellStyle}>Domain</th>
                <th style={cellStyle}>Created</th>
                <th style={cellStyle}></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...cellStyle, fontSize: 11, color: "var(--text-faint)" }}>{shortId(c.id)}</td>
                  <td style={cellStyle}>{c.name}</td>
                  <td style={cellStyle}>{c.domain ?? "—"}</td>
                  <td style={cellStyle}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td style={cellStyle}><button onClick={() => deleteCompany(c)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
