"use client";

import { useEffect, useState } from "react";

import { showAlert, showConfirm } from "../lib/app-dialog";
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
  backupModel: string | null;
  backupProvider: string | null;
  soul: string | null;
  apiKey: string | null;
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

interface AgentBrief {
  name: string;
  role?: string;
  jobDescription?: string;
  audience?: string;
  successDefinition?: string;
  tone?: string;
  languages?: string;
  rules?: string;
  examples?: string;
}

export function HermesAgentsPanel() {
  const [agents, setAgents] = useState<HermesAgent[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
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

  async function createAgentFromBrief(brief: AgentBrief): Promise<boolean> {
    const slug = slugify(brief.name);
    if (!slug) {
      await showAlert("Give the agent a name (letters/numbers).");
      return false;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/hermes-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, brief }),
      });
      const data = (await res.json()) as { slug?: string; apiKey?: string; error?: string };
      if (!res.ok || !data.apiKey) {
        await showAlert(data.error ?? "Failed to create agent.");
        return false;
      }
      await refresh();
      await showAlert(
        `Agent '${data.slug}' created and trained on its SOUL.\n\nCopy this API key now — it is only shown once:\n\n${data.apiKey}`
      );
      return true;
    } catch {
      await showAlert("Could not create agent.");
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function saveAgent(
    agent: HermesAgent,
    patch: { soul?: string; model?: string; provider?: string; backupModel?: string; backupProvider?: string }
  ) {
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
    <div style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">AI account &amp; access</span>
          <div style={{ display: "flex", gap: 8 }}>
            {!auth?.signedIn && (
              <button
                className="primary sm"
                onClick={() => void startSignIn(false)}
                disabled={sign.phase === "waiting"}
              >
                {sign.phase === "done" && !sign.message ? "Signed in" : "Authorize provider"}
              </button>
            )}
            {auth?.signedIn && (
              <button
                className="sm"
                onClick={() => void startSignIn(true)}
                disabled={sign.phase === "waiting"}
              >
                {sign.phase === "waiting" ? "Waiting for approval" : "Add another account"}
              </button>
            )}
          </div>
        </div>

        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="meta" style={{ margin: 0 }}>
            Authorize an AI provider once for the platform&apos;s default agent — every agent created here
            inherits it. Until an account is authorized, chat replies fall back to a login-failure message.
            With several accounts, switch to another if one stops working.
          </p>

          {auth &&
            (auth.signedIn ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span className="lamp lamp-ok">Authorized</span>
                  <span className="meta">
                    Chats are served with real AI replies
                    {sign.phase === "done" && !sign.message ? ", just signed in" : ""}.
                  </span>
                </div>

                {auth.accounts.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>State</th>
                          <th>Detail</th>
                          <th style={{ textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auth.accounts.map((acc) => (
                          <tr key={acc.id}>
                            <td className="data" style={{ color: "var(--ink)", fontWeight: 500 }}>
                              {acc.label}
                            </td>
                            <td>
                              {acc.active ? (
                                <span className="lamp lamp-ok">Active</span>
                              ) : acc.exhausted ? (
                                <span className="lamp lamp-warn">Unavailable</span>
                              ) : (
                                <span className="lamp lamp-idle">Standby</span>
                              )}
                            </td>
                            <td className="data">{acc.exhausted ?? "—"}</td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {!acc.active && (
                                  <button
                                    className="primary sm"
                                    onClick={() => void authAction("activate", acc.id)}
                                    title="Make this the active account"
                                  >
                                    Use this
                                  </button>
                                )}
                                {acc.exhausted && (
                                  <button
                                    className="sm"
                                    onClick={() => void authAction("reset", acc.id)}
                                    title="Clear the exhaustion/cooldown flag"
                                  >
                                    Reset cooldown
                                  </button>
                                )}
                                <button
                                  className="danger sm"
                                  onClick={() => void removeAccount(acc)}
                                  title="Sign out this account"
                                >
                                  Sign out
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {auth.freeTier ? (
                  <>
                    <span className="lamp lamp-warn">Free tier — welcome model only</span>
                    <span className="meta">
                      Chats stay limited until an account is authorized.
                    </span>
                  </>
                ) : (
                  <span className="lamp lamp-err">
                    Not signed in — chats reply with a login-failure message
                  </span>
                )}
                {auth.message && <span className="meta">{auth.message}</span>}
              </div>
            ))}

          {sign.phase === "waiting" && (
            <div
              className="machine-block"
              style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}
            >
              {sign.link ? (
                <>
                  <a href={sign.link} target="_blank" rel="noreferrer" className="data">
                    {sign.link}
                  </a>
                  <span>
                    Enter code{" "}
                    <strong className="data" style={{ fontSize: 15 }}>
                      {sign.code}
                    </strong>
                  </span>
                  <span className="lamp lamp-machine">Waiting for approval</span>
                </>
              ) : (
                <span className="lamp lamp-machine">Starting sign-in</span>
              )}
            </div>
          )}
          {sign.phase === "done" && sign.message && <span className="meta">{sign.message}</span>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">Hermes agents</span>
          <button className="primary sm" onClick={() => setWizardOpen(true)}>
            New agent
          </button>
        </div>
        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="meta" style={{ margin: 0 }}>
            One agent per business, or a shared one. Each has its own persona (SOUL) and persistent
            memory, served under <code>/p/&lt;slug&gt;/v1/chat/completions</code>. A business with
            <code> hermesEnabled </code> routes its chats here.
          </p>
          <div className="machine-block" style={{ fontSize: 12.5 }}>
            Answer a few questions and the agent&apos;s persona (SOUL.md) is written for you. The slug
            comes from the agent&apos;s name, never a business name.
          </div>
          {error && <div className="field-error">{error}</div>}
        </div>
      </section>

      {wizardOpen && (
        <AgentWizard
          onClose={() => setWizardOpen(false)}
          onCreate={async (brief) => {
            // Only dismiss the wizard once the agent actually exists, so a
            // failed create leaves the answered questions in place to retry.
            const created = await createAgentFromBrief(brief);
            if (created) setWizardOpen(false);
            return created;
          }}
          creating={creating}
        />
      )}

      {agents === null && !error && (
        <div className="panel">
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton skeleton-text" style={{ width: "30%" }} />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-text" />
          </div>
        </div>
      )}

      {(agents ?? []).map((agent) => {
        const open = openSlug === agent.slug;
        return (
          <section className="panel" key={agent.slug}>
            <div className="panel-head">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenSlug(open ? null : agent.slug)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  padding: 0,
                }}
              >
                <span className="data" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  {agent.slug}
                </span>
                {agent.provisioned ? (
                  <span className="lamp lamp-ok">Provisioned</span>
                ) : (
                  <span className="lamp lamp-err">No API key</span>
                )}
                <span className="meta">
                  model <span className="data">{agent.model ?? "gateway default"}</span>
                </span>
                {agent.provider && (
                  <span className="meta">
                    provider <span className="data">{agent.provider}</span>
                  </span>
                )}
              </button>
              <button className="danger sm" onClick={() => deleteAgent(agent)}>
                Delete agent
              </button>
            </div>

            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {agent.apiKey && <ApiKeyRow slug={agent.slug} apiKey={agent.apiKey} />}

              {agent.businesses.length > 0 ? (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Routing</th>
                          <th style={{ textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agent.businesses.map((b) => (
                          <tr key={b.id}>
                            <td style={{ color: "var(--ink)" }}>{b.name}</td>
                            <td>
                              {b.hermesEnabled ? (
                                <span className="lamp lamp-ok">Live</span>
                              ) : (
                                <span className="lamp lamp-idle">Off</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void unassignBusiness(agent, b.id);
                                }}
                                title="Unassign this business"
                              >
                                Unassign
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`assign-${agent.slug}`}>
                      Assign another business
                    </label>
                    <select
                      id={`assign-${agent.slug}`}
                      value=""
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.value) assignBusiness(agent, e.target.value);
                      }}
                      disabled={fetchingBusinesses}
                    >
                      <option value="" disabled selected>Choose a business…</option>
                      {allBusinesses
                        .filter((biz) => !agent.businesses.some((ab) => ab.id === biz.id))
                        .map((biz) => (
                          <option key={biz.id} value={biz.id}>{biz.name}</option>
                        ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <span className="meta">Not assigned to any business.</span>
                  <div className="field">
                    <label className="field-label" htmlFor={`assign-${agent.slug}`}>
                      Assign a business
                    </label>
                    <select
                      id={`assign-${agent.slug}`}
                      value=""
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.value) assignBusiness(agent, e.target.value);
                      }}
                      disabled={fetchingBusinesses}
                    >
                      <option value="" disabled selected>Choose a business…</option>
                      {allBusinesses.map((biz) => (
                        <option key={biz.id} value={biz.id}>{biz.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {open && (
                <>
                  <EditableAgent agent={agent} onSave={saveAgent} />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    <AgentInsights slug={agent.slug} />
                    <TrainLanguagePanel slug={agent.slug} />
                  </div>
                </>
              )}
            </div>
          </section>
        );
      })}

      {agents !== null && agents.length === 0 && !error && (
        <div className="empty-state">
          <span className="empty-state-title">No agents configured yet</span>
          <span className="empty-state-description">
            Add an agent to route WhatsApp replies automatically.
          </span>
        </div>
      )}
    </div>
  );
}

function ApiKeyRow({ slug, apiKey }: { slug: string; apiKey: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${apiKey.slice(0, 9)}…${apiKey.slice(-4)}`;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
      onClick={(e) => e.stopPropagation()}
      title={`API key for '${slug}' — used to call /p/${slug}/v1/chat/completions`}
    >
      <span className="meta" style={{ flexShrink: 0 }}>API key</span>
      <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {truncated}
      </code>
      <button
        type="button"
        className="sm"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(apiKey).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => {
              /* clipboard unavailable — fall back to a prompt */
            }
          );
        }}
      >
        {copied ? "Copied" : "Copy key"}
      </button>
    </div>
  );
}

function EditableAgent({
  agent,
  onSave,
}: {
  agent: HermesAgent;
  onSave: (
    agent: HermesAgent,
    patch: { soul?: string; model?: string; provider?: string; backupModel?: string; backupProvider?: string }
  ) => Promise<void>;
}) {
  const [soul, setSoul] = useState(agent.soul ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [provider, setProvider] = useState(agent.provider ?? "");
  const [backupModel, setBackupModel] = useState(agent.backupModel ?? "");
  const [backupProvider, setBackupProvider] = useState(agent.backupProvider ?? "");
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);

  async function polish() {
    setPolishing(true);
    try {
      const res = await fetch(`/api/admin/hermes-agents/${agent.slug}/soul`, { method: "POST" });
      const data = (await res.json()) as { soul?: string; error?: string };
      if (!res.ok || !data.soul) {
        await showAlert(data.error ?? "Polish failed.");
        return;
      }
      setSoul(data.soul);
      await onSave(agent, { soul: data.soul });
    } catch {
      await showAlert("Could not polish the persona.");
    } finally {
      setPolishing(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const patch: {
        soul?: string;
        model?: string;
        provider?: string;
        backupModel?: string;
        backupProvider?: string;
      } = {};
      if ((soul.trim() ?? "") !== (agent.soul ?? "").trim()) patch.soul = soul;
      const m = model.trim();
      const p = provider.trim();
      if (m !== (agent.model ?? "")) patch.model = m;
      if (p !== (agent.provider ?? "")) patch.provider = p;
      if (backupModel.trim() !== (agent.backupModel ?? "")) patch.backupModel = backupModel.trim();
      if (backupProvider.trim() !== (agent.backupProvider ?? "")) patch.backupProvider = backupProvider.trim();
      if (Object.keys(patch).length > 0) await onSave(agent, patch);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="field-label">Primary model</span>
        <ModelSelector
          value={model.trim() || null}
          provider={provider.trim() || null}
          slug={agent.slug}
          onChange={(m, p) => {
            setModel(m ?? "");
            setProvider(p ?? "");
          }}
        />
        <span className="field-hint">
          Written as <code>AIVA_MODEL</code>. Leave blank to use the gateway default.
        </span>
      </label>

      <label className="field" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="field-label">Backup model</span>
        <ModelSelector
          value={backupModel.trim() || null}
          provider={backupProvider.trim() || null}
          slug={agent.slug}
          onChange={(m, p) => {
            setBackupModel(m ?? "");
            setBackupProvider(p ?? "");
          }}
        />
        <span className="field-hint">
          Written as <code>AIVA_BACKUP_MODEL</code>.
        </span>
      </label>

      <div className="machine-block" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="instrument-label" style={{ color: "var(--machine)" }}>
          Fallback chain
        </span>
        <span>
          <span className="data">{model.trim() || "gateway default"}</span>
          {" → "}
          <span className="data">{backupModel.trim() || "platform free model"}</span>
          {" → local model → human handoff"}
        </span>
        <span className="meta">
          {backupModel.trim()
            ? "The backup is tried automatically when the primary fails."
            : "No backup set: a failed primary goes straight to the platform free model."}{" "}
          A customer never sees a provider error.
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`soul-${agent.slug}`}>
          Persona (SOUL.md)
        </label>
        <textarea
          id={`soul-${agent.slug}`}
          aria-label="Persona (SOUL.md) for this agent"
          style={{ minHeight: 180, fontFamily: "var(--font-mono)", fontSize: 12 }}
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save agent"}
        </button>
        <button
          className="machine"
          onClick={polish}
          disabled={polishing}
          title="Ask Hermes to tighten this persona (one model call)"
        >
          {polishing ? "Polishing…" : "Polish with AI"}
        </button>
      </div>
    </div>
  );
}

// ── Agent name → slug (mirrors the server's slugifyName) ───────────────────
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ── Creation wizard: answers become the agent's SOUL.md ────────────────────
function AgentWizard({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (brief: AgentBrief) => Promise<boolean>;
  creating: boolean;
}) {
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<AgentBrief>({ name: "" });
  const set = (k: keyof AgentBrief) => (e: { target: { value: string } }) =>
    setBrief((b) => ({ ...b, [k]: e.target.value }));

  const slug = slugify(brief.name);
  const steps = ["Identity", "The job", "Voice & rules"];

  const field = (
    id: string,
    label: string,
    key: keyof AgentBrief,
    placeholder: string,
    textarea = false
  ) => (
    <div className="field" style={{ marginBottom: 10 }}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          style={{ minHeight: 64 }}
          placeholder={placeholder}
          value={brief[key] ?? ""}
          onChange={set(key)}
        />
      ) : (
        <input
          id={id}
          placeholder={placeholder}
          value={brief[key] ?? ""}
          onChange={set(key)}
        />
      )}
    </div>
  );

  return (
    <section className="panel" style={{ borderLeft: "2px solid var(--machine-line)" }}>
      <div className="panel-head">
        <span className="instrument-label">Train a new agent</span>
        <button className="ghost sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {steps.map((s, i) => (
            <div
              key={s}
              className={i === step ? "lamp lamp-machine" : "lamp lamp-idle"}
              style={{
                flex: 1,
                justifyContent: "center",
                padding: "5px 6px",
                borderRadius: "var(--r-xs)",
                background: i === step ? "var(--machine-subtle)" : "var(--panel-sunk)",
                border: `1px solid ${i === step ? "var(--machine-line)" : "var(--line)"}`,
              }}
            >
              <span className="data">{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <>
            {field("wiz-name", "Agent name", "name", "e.g. Maya — the front-desk assistant")}
            {field("wiz-role", "Role / title", "role", "e.g. Front desk coordinator")}
            <div className="machine-block" style={{ fontSize: 12.5 }}>
              Slug <span className="data">{slug || "—"}</span> comes from the agent&apos;s name, not a
              business. You can assign it to a business later.
            </div>
          </>
        )}
        {step === 1 && (
          <>
            {field("wiz-job", "What does it do?", "jobDescription", "Answer questions, take bookings, resolve issues…", true)}
            {field("wiz-audience", "Who does it talk to?", "audience", "Customers of the business, mostly via WhatsApp")}
            {field("wiz-success", "What does a good day look like?", "successDefinition", "Every customer gets an answer; no wrong bookings.")}
          </>
        )}
        {step === 2 && (
          <>
            {field("wiz-tone", "How should it speak?", "tone", "Warm, concise, professional; uses the customer's name")}
            {field("wiz-languages", "Languages", "languages", "English and Spanish, mirror the customer's language")}
            {field("wiz-rules", "Hard rules", "rules", "Never quote pricing over $500 without a human. Never guess.", true)}
            {field("wiz-examples", "Example replies", "examples", "Hi! How can I help today?", true)}
          </>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {step > 0 && (
            <button className="ghost" onClick={() => setStep(step - 1)} disabled={creating}>
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              className="primary"
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !brief.name.trim()}
            >
              Next
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => onCreate(brief)}
              disabled={creating || !brief.name.trim()}
            >
              {creating ? "Creating…" : `Create '${slug || "agent"}'`}
            </button>
          )}
          <span className="meta">The persona is written on the server — free and instant.</span>
        </div>
      </div>
    </section>
  );
}

// ── Insights: what it learned + how it's going ─────────────────────────────
interface Insights {
  slug: string;
  raw?: boolean;
  memory?: string;
  userMemory?: string;
  skills?: Array<{ name: string; category: string; description: string }>;
  totals?: { sessions: number; messages: number; first_ts: number | null; last_ts: number | null };
  usage?: { calls: number; input_tokens: number; output_tokens: number; cache_read_tokens: number };
  daily?: Array<{ day: string; n: number }>;
  lastUserMessages?: Array<{ content: string; at: string }>;
  messages?: Array<{ id: number; role: string; content: string; timestamp: number }>;
  usageRows?: Array<Record<string, number | string | null>>;
}

function AgentInsights({ slug }: { slug: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [raw, setRaw] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  async function load(view: "curated" | "raw") {
    setErr("");
    try {
      const res = await fetch(`/api/admin/hermes-agents/${slug}/insights?view=${view}`);
      const json = (await res.json()) as Insights & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load insights");
      setData(json);
      setRaw(view === "raw");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button
        className="ghost sm"
        style={{ alignSelf: "flex-start" }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); void load("curated"); }}
      >
        Show insights
      </button>
    );
  }

  const t = data?.totals;
  const u = data?.usage;
  const totalTokens = (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0);
  const metrics: Array<[string, string]> = [
    ["Messages", (t?.messages ?? 0).toLocaleString()],
    ["Sessions", (t?.sessions ?? 0).toLocaleString()],
    ["Model calls", (u?.calls ?? 0).toLocaleString()],
    ["Tokens", totalTokens.toLocaleString()],
  ];
  return (
    <div className="panel-sunk" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <span className="instrument-label">Insights</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="ghost sm"
            onClick={(e) => { e.stopPropagation(); void load(raw ? "raw" : "curated"); }}
          >
            Refresh
          </button>
          {!raw ? (
            <button className="ghost sm" onClick={(e) => { e.stopPropagation(); void load("raw"); }}>Raw view</button>
          ) : (
            <button className="ghost sm" onClick={(e) => { e.stopPropagation(); void load("curated"); }}>Curated view</button>
          )}
        </div>
      </div>
      {err && <div className="field-error">{err}</div>}
      {!data && !err && <span className="lamp lamp-idle">Loading insights</span>}

      {data && raw && (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            maxHeight: 260,
            overflow: "auto",
            margin: 0,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-xs)",
            padding: 10,
          }}
        >
          {JSON.stringify({ totals: data.totals, usage: data.usage, messages: data.messages, usageRows: data.usageRows }, null, 2)}
        </pre>
      )}

      {data && !raw && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num" style={{ textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(([label, value]) => (
                  <tr key={label}>
                    <td className="meta">{label}</td>
                    <td className="num" style={{ textAlign: "right" }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!data.daily?.length && (
            <div>
              <div className="meta">Activity, last {data.daily.length} days</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40, marginTop: 4 }}>
                {data.daily.map((d) => {
                  const max = Math.max(...data.daily!.map((x) => x.n), 1);
                  return (
                    <div
                      key={d.day}
                      title={`${d.day}: ${d.n}`}
                      style={{
                        flex: 1,
                        height: `${Math.max(8, (d.n / max) * 100)}%`,
                        background: "var(--machine)",
                        opacity: 0.55,
                        borderRadius: "var(--r-xs)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {!!data.skills?.length && (
            <div>
              <div className="meta">
                Skills loaded <span className="data">{data.skills.length}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {data.skills.map((s) => (
                  <span
                    key={`${s.category}/${s.name}`}
                    className="data"
                    style={{
                      fontSize: 11,
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      padding: "2px 6px",
                      borderRadius: "var(--r-xs)",
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!!data.memory && (
            <div>
              <div className="meta">What it learned (MEMORY.md)</div>
              <pre
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  maxHeight: 160,
                  overflow: "auto",
                  margin: "4px 0 0",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-xs)",
                  padding: 10,
                }}
              >
                {data.memory}
              </pre>
            </div>
          )}

          {!!data.lastUserMessages?.length && (
            <div>
              <div className="meta">Recent questions</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11.5 }}>
                {data.lastUserMessages.map((m, i) => <li key={i}>{m.content}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Language trainer (on-demand, hard-capped) ──────────────────────────────
function TrainLanguagePanel({ slug }: { slug: string }) {
  const [language, setLanguage] = useState("");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState("");

  async function train() {
    setBusy(true);
    setResult("");
    setErr("");
    try {
      const res = await fetch(`/api/admin/hermes-agents/${slug}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          urls: urls.split(/\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 5),
        }),
      });
      const data = (await res.json()) as { error?: string; summary?: string; fetched?: number; cachedHits?: number; capped?: boolean; seconds?: number; skillPath?: string };
      if (!res.ok) throw new Error(data.error ?? "Training failed");
      setResult(`Trained on ${data.fetched} source(s) (${data.cachedHits} cached) in ${data.seconds}s → ${data.skillPath}${data.capped ? " (capped)" : ""}\n\n${data.summary ?? ""}`);
      setUrls("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-sunk" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <span className="instrument-label">Language trainer</span>
        <button className="machine sm" onClick={train} disabled={busy || !language.trim()}>
          {busy ? "Training…" : "Train language"}
        </button>
      </div>
      <p className="meta" style={{ margin: 0 }}>
        On demand and hard-capped (6 pages / 12k chars / 120s). Reads curated public sources; add
        your own URLs below. Teaches the agent a reusable language pack — one model call, then
        it&apos;s cached.
      </p>
      <div className="field">
        <label className="field-label" htmlFor={`train-lang-${slug}`}>
          Language
        </label>
        <input
          id={`train-lang-${slug}`}
          placeholder="Brazilian Portuguese or Tagalog"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`train-urls-${slug}`}>
          Extra sources
        </label>
        <textarea
          id={`train-urls-${slug}`}
          style={{ minHeight: 48 }}
          placeholder="Optional. One https URL per line."
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
        <span className="field-hint">First five URLs are used.</span>
      </div>
      {err && <div className="field-error">{err}</div>}
      {result && (
        <div className="machine-block">
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              whiteSpace: "pre-wrap",
              maxHeight: 180,
              overflow: "auto",
              margin: 0,
            }}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
