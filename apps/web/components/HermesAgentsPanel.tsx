"use client";

import { useEffect, useState } from "react";

import { showAlert, showConfirm } from "../lib/app-dialog";
import {
  cardStyle,
  dangerButtonStyle,
  inputStyle,
  primaryButtonStyle,
  subtleTextStyle,
} from "./dashboard-styles";
import { ModelSelector } from "./ModelSelector";

interface HermesAgentBusiness {
  id: string;
  name: string;
  slug: string;
  hermesEnabled: boolean;
}

interface HermesAgent {
  slug: string;
  provisioned: boolean;
  model: string | null;
  provider: string | null;
  soul: string | null;
  businesses: HermesAgentBusiness[];
}

interface AuthAccount {
  idx: number;
  id: string;
  label: string;
  authType: string;
  active: boolean;
  exhausted?: string;
}

interface AuthStatus {
  signedIn: boolean;
  freeTier: boolean;
  activeId?: string;
  accounts: AuthAccount[];
  message?: string;
}

interface SignInState {
  phase: "idle" | "waiting" | "done";
  link?: string;
  code?: string;
  message?: string;
}

export function HermesAgentsPanel() {
  const [agents, setAgents] = useState<HermesAgent[] | null>(null);
  const [error, setError] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [sign, setSign] = useState<SignInState>({ phase: "idle" });

  // All businesses for assignment dropdown
  const [allBusinesses, setAllBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [fetchingBusinesses, setFetchingBusinesses] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/hermes-agents");
      const data = (await res.json()) as { agents: HermesAgent[] };
      setAgents(data.agents ?? []);
      setError("");
    } catch {
      setAgents([]);
      setError("Could not load Hermes agents.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setFetchingBusinesses(true);
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => {
        const businesses = (data.clients ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        }));
        setAllBusinesses(businesses);
      })
      .catch(() => setAllBusinesses([]))
      .finally(() => setFetchingBusinesses(false));
  }, []);

  async function loadAuth() {
    try {
      const res = await fetch("/api/admin/hermes-auth");
      const data = (await res.json()) as { auth: AuthStatus };
      setAuth(data.auth ?? { signedIn: false, freeTier: false, accounts: [] });
    } catch {
      /* transient — keep last state */
    }
  }

  useEffect(() => {
    void loadAuth();
  }, []);

  // Poll the device-code flow until the portal approval lands (or expires).
  useEffect(() => {
    if (sign.phase !== "waiting") return;
    const t = setInterval(() => {
      fetch("/api/admin/hermes-auth?signin=1")
        .then((r) => r.json())
        .then((next: SignInState) => {
          if (next.phase !== "waiting") {
            setSign(next);
            void loadAuth();
          } else if (next.link) {
            setSign(next);
          }
        })
        .catch(() => {
          /* transient poll failure — keep trying */
        });
    }, 2_500);
    return () => clearInterval(t);
  }, [sign.phase]);

  async function startSignIn(addAccount: boolean) {
    try {
      const res = await fetch("/api/admin/hermes-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", addAccount }),
      });
      const data = (await res.json()) as { signin?: SignInState; error?: string };
      if (!res.ok || !data.signin) throw new Error(data.error ?? "Could not start sign-in.");
      setSign(data.signin);
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : String(err));
    }
  }

  async function authAction(action: string, id?: string) {
    try {
      const res = await fetch("/api/admin/hermes-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = (await res.json()) as { auth?: AuthStatus; error?: string };
      if (!res.ok || !data.auth) throw new Error(data.error ?? "Action failed.");
      setAuth(data.auth);
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeAccount(acc: AuthAccount) {
    if (!(await showConfirm(`Sign out '${acc.label}'?\n\nThis removes the account from the platform's default agent. Lost chats switch to the next account (or to login-failure replies).`))) {
      return;
    }
    await authAction("remove", acc.id);
  }

  async function createAgent() {
    const slug = newSlug.trim().toLowerCase();
    if (!slug) {
      await showAlert("Enter an agent slug first (lowercase letters, digits, dashes).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/hermes-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json()) as { slug?: string; apiKey?: string; error?: string };
      if (!res.ok || !data.apiKey) {
        await showAlert(data.error ?? "Failed to create agent.");
        return;
      }
      setNewSlug("");
      await refresh();
      await showAlert(
        `Agent '${data.slug}' created.\n\nCopy this API key now — it is only shown once:\n\n${data.apiKey}`
      );
    } catch {
      await showAlert("Could not create agent.");
    } finally {
      setCreating(false);
    }
  }

  async function saveAgent(agent: HermesAgent, patch: { soul?: string; model?: string; provider?: string }) {
    const res = await fetch(`/api/admin/hermes-agents/${agent.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      await showAlert(data.error ?? "Failed to save.");
      return;
    }
    await refresh();
  }

  async function deleteAgent(agent: HermesAgent) {
    if (!(await showConfirm(`Delete Hermes agent '${agent.slug}'?\n\nThis removes its profile, persona, memory and API key from disk.`))) {
      return;
    }
    const res = await fetch(`/api/admin/hermes-agents/${agent.slug}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      await showAlert(data.error ?? "Failed to delete.");
      return;
    }
    await refresh();
  }

  async function assignBusiness(agent: HermesAgent, businessId: string) {
    try {
      const res = await fetch(`/api/admin/clients/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesProfile: agent.slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        await showAlert(data.error ?? "Failed to assign business.");
        return;
      }
      await refresh();
    } catch {
      await showAlert("Could not assign business.");
    }
  }

  async function unassignBusiness(agent: HermesAgent, businessId: string) {
    try {
      const res = await fetch(`/api/admin/clients/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesProfile: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        await showAlert(data.error ?? "Failed to unassign business.");
        return;
      }
      await refresh();
    } catch {
      await showAlert("Could not unassign business.");
    }
  }

  return (
    <div style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>AI account &amp; access</div>
        <div style={subtleTextStyle}>
          Authorize an AI provider once for the platform&apos;s default agent — every agent created here
          inherits it. Chat replies fall back to a login-failure message until an account is
          authorized; with several accounts, switch to another if one stops working.
        </div>

        {auth && (
          auth.signedIn ? (
            <div style={{ color: "var(--success)", fontSize: 13, marginTop: 8 }}>
              Authorized ✓
              <span style={subtleTextStyle}>
                {" "}— chats are served with real AI replies{sign.phase === "done" && !sign.message ? ", just signed in" : ""}.
              </span>
              {auth.accounts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {auth.accounts.map((acc) => (
                    <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <span style={{ fontFamily: "monospace" }}>{acc.label}</span>
                      {acc.active && <span style={{ color: "var(--success)" }}>(active)</span>}
                      {acc.exhausted && <span style={{ color: "#b76e12" }}>{acc.exhausted}</span>}
                      {!acc.active && (
                        <button
                          className="plain"
                          onClick={() => void authAction("activate", acc.id)}
                          style={{ fontSize: 11, padding: "2px 6px" }}
                          title="Make this the active account"
                        >
                          Use
                        </button>
                      )}
                      {acc.exhausted && (
                        <button
                          className="plain"
                          onClick={() => void authAction("reset", acc.id)}
                          style={{ fontSize: 11, padding: "2px 6px" }}
                          title="Clear the exhaustion/cooldown flag"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        className="plain"
                        onClick={() => void removeAccount(acc)}
                        style={{ fontSize: 11, color: "var(--danger)", padding: "2px 6px" }}
                        title="Sign out this account"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: auth.freeTier ? "#b76e12" : "var(--danger)", fontSize: 13 }}>
                {auth.freeTier
                  ? "Free tier — welcome model only. Chats will be limited until an account is authorized."
                  : "Not signed in — chats currently reply with a login-failure message."}
              </div>
              {auth.message && <div style={{ ...subtleTextStyle, fontSize: 11.5 }}>{auth.message}</div>}
            </div>
          )
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {!auth?.signedIn && (
            <button
              style={primaryButtonStyle}
              onClick={() => void startSignIn(false)}
              disabled={sign.phase === "waiting"}
            >
              {sign.phase === "done" && !sign.message ? "Signed in ✓" : "Authorize / Sign in"}
            </button>
          )}
          {auth?.signedIn && (
            <button
              style={primaryButtonStyle}
              onClick={() => void startSignIn(true)}
              disabled={sign.phase === "waiting"}
            >
              {sign.phase === "waiting" ? "Waiting…" : "Add another account"}
            </button>
          )}
        </div>

        {sign.phase === "waiting" && (
          <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
            {sign.link ? (
              <>
                <a href={sign.link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  {sign.link}
                </a>
                <span>
                  Enter code: <strong style={{ fontFamily: "monospace", fontSize: 15 }}>{sign.code}</strong>
                </span>
                <span style={subtleTextStyle}>Waiting for approval…</span>
              </>
            ) : (
              <span style={subtleTextStyle}>Starting sign-in…</span>
            )}
          </div>
        )}
        {sign.phase === "done" && sign.message && (
          <div style={{ ...subtleTextStyle, fontSize: 12, marginTop: 8 }}>{sign.message}</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Hermes Agents</div>
        <div style={subtleTextStyle}>
          One agent per business (or a shared one). Each has its own persona (SOUL) and persistent memory, served
          under <code>/p/&lt;slug&gt;/v1/chat/completions</code>. Set a model override to pick the AI; leaving it
          blank uses the gateway default. A business with <code>hermesEnabled</code> routes its chats here.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            style={inputStyle}
            placeholder="new agent slug (e.g. downtown-dental)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
          />
          <button style={primaryButtonStyle} onClick={createAgent} disabled={creating}>
            {creating ? "Creating…" : "Create agent"}
          </button>
        </div>
        {error && <div style={{ color: "#b3261e", marginTop: 8 }}>{error}</div>}
      </div>

      {(agents ?? []).map((agent) => {
        const open = openSlug === agent.slug;
        return (
          <div key={agent.slug} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div
                style={{ cursor: "pointer", flex: 1 }}
                onClick={() => setOpenSlug(open ? null : agent.slug)}
              >
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>{agent.slug}</span>
                {!agent.provisioned && (
                  <span style={{ color: "#b3261e", fontSize: 12, marginLeft: 8 }}>missing API key</span>
                )}
                <div style={subtleTextStyle}>
                  {agent.model ?? "default model"}
                  {agent.provider ? ` · ${agent.provider}` : ""}
                </div>
                {agent.businesses.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <div style={subtleTextStyle}>Used by:</div>
                    {agent.businesses.map((b) => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ color: b.hermesEnabled ? "var(--success)" : "var(--text-muted)" }}>
                          {b.name} {b.hermesEnabled ? "(live)" : "(off)"}
                        </span>
                        <button
                          className="plain"
                          onClick={(e) => { e.stopPropagation(); unassignBusiness(agent, b.id); }}
                          style={{ fontSize: 11, color: "var(--danger)", padding: "2px 6px" }}
                          title="Unassign"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div style={{ marginTop: 4 }}>
                      <select
                        value=""
                        onChange={(e) => { e.stopPropagation(); if (e.target.value) assignBusiness(agent, e.target.value); }}
                        disabled={fetchingBusinesses}
                        style={{ ...inputStyle, fontSize: 12, padding: "4px 8px", width: "100%" }}
                      >
                        <option value="" disabled selected>Assign another business…</option>
                        {allBusinesses
                          .filter((biz) => !agent.businesses.some((ab) => ab.id === biz.id))
                          .map((biz) => (
                            <option key={biz.id} value={biz.id}>{biz.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <div style={subtleTextStyle}>Not assigned to any business.</div>
                    <select
                      value=""
                      onChange={(e) => { e.stopPropagation(); if (e.target.value) assignBusiness(agent, e.target.value); }}
                      disabled={fetchingBusinesses}
                      style={{ ...inputStyle, fontSize: 12, padding: "4px 8px", width: "100%" }}
                    >
                      <option value="" disabled selected>Assign a business…</option>
                      {allBusinesses.map((biz) => (
                        <option key={biz.id} value={biz.id}>{biz.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button style={dangerButtonStyle} onClick={() => deleteAgent(agent)}>
                Delete
              </button>
            </div>

            {open && <EditableAgent agent={agent} onSave={saveAgent} />}
          </div>
        );
      })}

      {agents !== null && agents.length === 0 && !error && (
        <div style={cardStyle}>
          <div style={subtleTextStyle}>No agents yet — create one above.</div>
        </div>
      )}
    </div>
  );
}

function EditableAgent({
  agent,
  onSave,
}: {
  agent: HermesAgent;
  onSave: (agent: HermesAgent, patch: { soul?: string; model?: string; provider?: string }) => Promise<void>;
}) {
  const [soul, setSoul] = useState(agent.soul ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [provider, setProvider] = useState(agent.provider ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const patch: { soul?: string; model?: string; provider?: string } = {};
      if ((soul.trim() ?? "") !== (agent.soul ?? "").trim()) patch.soul = soul;
      const m = model.trim();
      const p = provider.trim();
      if (m !== (agent.model ?? "")) patch.model = m;
      if (p !== (agent.provider ?? "")) patch.provider = p;
      if (Object.keys(patch).length > 0) await onSave(agent, patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <label style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Model (AIVA_MODEL · blank = gateway default)
        <div style={{ marginTop: 4 }}>
          <ModelSelector
            value={model.trim() || null}
            provider={provider.trim() || null}
            slug={agent.slug}
            onChange={(m, p) => {
              setModel(m ?? "");
              setProvider(p ?? "");
            }}
          />
        </div>
      </label>
      <label style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Persona (SOUL.md)
        <textarea
          style={{ ...inputStyle, minHeight: 180, marginTop: 4, fontFamily: "monospace", fontSize: 12 }}
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
        />
      </label>
      <div>
        <button style={primaryButtonStyle} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save agent"}
        </button>
      </div>
    </div>
  );
}