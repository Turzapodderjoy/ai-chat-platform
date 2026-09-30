"use client";

import { useEffect, useState } from "react";

import { showAlert, showConfirm } from "../lib/app-dialog";
import {
  cardStyle,
  dangerButtonStyle,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
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
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button style={primaryButtonStyle} onClick={() => setWizardOpen(true)}>
            + New agent
          </button>
          <span style={subtleTextStyle}>
            Answer a few questions and the agent&apos;s persona (SOUL.md) is written for you. The slug comes
            from the agent&apos;s name, never a business name.
          </span>
        </div>
        {error && <div style={{ color: "#b3261e", marginTop: 8 }}>{error}</div>}
      </div>

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
                {agent.apiKey && <ApiKeyRow slug={agent.slug} apiKey={agent.apiKey} />}
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

            {open && (
              <>
                <EditableAgent agent={agent} onSave={saveAgent} />
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <AgentInsights slug={agent.slug} />
                  <TrainLanguagePanel slug={agent.slug} />
                </div>
              </>
            )}
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

function ApiKeyRow({ slug, apiKey }: { slug: string; apiKey: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${apiKey.slice(0, 9)}…${apiKey.slice(-4)}`;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12 }}
      onClick={(e) => e.stopPropagation()}
      title={`API key for '${slug}' — used to call /p/${slug}/v1/chat/completions`}
    >
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>API key:</span>
      <code style={{ fontFamily: "monospace", fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncated}</code>
      <button
        type="button"
        className="plain"
        style={{ fontSize: 11, padding: "2px 8px", flexShrink: 0, color: copied ? "var(--success, #34a853)" : "var(--accent)" }}
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
        {copied ? "copied ✓" : "copy"}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <label style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Primary model (AIVA_MODEL · blank = gateway default)
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
        Backup model (AIVA_BACKUP_MODEL · used when the primary fails)
        <div style={{ marginTop: 4 }}>
          <ModelSelector
            value={backupModel.trim() || null}
            provider={backupProvider.trim() || null}
            slug={agent.slug}
            onChange={(m, p) => {
              setBackupModel(m ?? "");
              setBackupProvider(p ?? "");
            }}
          />
        </div>
        <div style={{ ...subtleTextStyle, fontSize: 11.5, marginTop: 4 }}>
          {backupModel.trim()
            ? `Tried automatically if ${model.trim() || "the gateway default"} fails, then the local model, then a handoff.`
            : "Blank = the platform free model, then the local model, then a handoff. A customer never sees a provider error."}
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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={primaryButtonStyle} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save agent"}
        </button>
        <button
          style={secondaryButtonStyle}
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
    label: string,
    key: keyof AgentBrief,
    placeholder: string,
    textarea = false
  ) => (
    <label style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
      {label}
      {textarea ? (
        <textarea
          style={{ ...inputStyle, minHeight: 64, marginTop: 4 }}
          placeholder={placeholder}
          value={brief[key] ?? ""}
          onChange={set(key)}
        />
      ) : (
        <input
          style={{ ...inputStyle, marginTop: 4 }}
          placeholder={placeholder}
          value={brief[key] ?? ""}
          onChange={set(key)}
        />
      )}
    </label>
  );

  return (
    <div style={{ ...cardStyle, borderLeft: "3px solid var(--accent, #5b6cff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Train a new agent</div>
        <button className="plain" onClick={onClose} style={{ fontSize: 12 }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "10px 0 14px" }}>
        {steps.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              fontSize: 11.5,
              padding: "4px 6px",
              borderRadius: 4,
              textAlign: "center",
              background: i === step ? "var(--accent, #5b6cff)" : "var(--surface-2, #222)",
              color: i === step ? "#fff" : "var(--text-muted)",
            }}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          {field("Agent name", "name", "e.g. Maya — the front-desk assistant")}
          {field("Role / title", "role", "e.g. Front desk coordinator")}
          <div style={subtleTextStyle}>
            Slug: <code style={{ fontFamily: "monospace" }}>{slug || "—"}</code> (from the agent&apos;s name, not
            a business). You can assign it to a business later.
          </div>
        </>
      )}
      {step === 1 && (
        <>
          {field("What does it do?", "jobDescription", "Answer questions, take bookings, resolve issues…", true)}
          {field("Who does it talk to?", "audience", "Customers of the business, mostly via WhatsApp")}
          {field("What does a good day look like?", "successDefinition", "Every customer gets an answer; no wrong bookings.")}
        </>
      )}
      {step === 2 && (
        <>
          {field("How should it speak?", "tone", "Warm, concise, professional; uses the customer's name")}
          {field("Languages", "languages", "English and Spanish, mirror the customer's language")}
          {field("Hard rules", "rules", "Never quote pricing over $500 without a human. Never guess.", true)}
          {field("Example replies", "examples", "Hi! How can I help today?", true)}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        {step > 0 && (
          <button style={secondaryButtonStyle} onClick={() => setStep(step - 1)} disabled={creating}>
            Back
          </button>
        )}
        {step < steps.length - 1 ? (
          <button
            style={primaryButtonStyle}
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && !brief.name.trim()}
          >
            Next
          </button>
        ) : (
          <button
            style={primaryButtonStyle}
            onClick={() => onCreate(brief)}
            disabled={creating || !brief.name.trim()}
          >
            {creating ? "Creating…" : `Create '${slug || "agent"}'`}
          </button>
        )}
        <span style={subtleTextStyle}>The persona is written on the server — free and instant.</span>
      </div>
    </div>
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
        className="plain"
        style={{ fontSize: 12, color: "var(--accent)", padding: 0, textAlign: "left" }}
        onClick={(e) => { e.stopPropagation(); setOpen(true); void load("curated"); }}
      >
        ▸ Insights — what it learned & how it&apos;s going
      </button>
    );
  }

  const t = data?.totals;
  const u = data?.usage;
  return (
    <div style={{ border: "1px solid var(--border, #333)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Insights</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!raw ? (
            <button className="plain" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); void load("raw"); }}>raw view</button>
          ) : (
            <button className="plain" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); void load("curated"); }}>back</button>
          )}
          <button className="plain" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); void load(raw ? "raw" : "curated"); }}>↻</button>
        </div>
      </div>
      {err && <div style={{ color: "#b3261e", fontSize: 12 }}>{err}</div>}
      {!data && !err && <div style={subtleTextStyle}>Loading…</div>}

      {data && raw && (
        <pre style={{ fontSize: 11, maxHeight: 260, overflow: "auto", background: "var(--surface-2, #1a1a1a)", padding: 8, borderRadius: 4 }}>
          {JSON.stringify({ totals: data.totals, usage: data.usage, messages: data.messages, usageRows: data.usageRows }, null, 2)}
        </pre>
      )}

      {data && !raw && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
            <span><b>{t?.messages ?? 0}</b> messages</span>
            <span><b>{t?.sessions ?? 0}</b> sessions</span>
            <span><b>{u?.calls ?? 0}</b> model calls</span>
            <span><b>{((u?.input_tokens ?? 0) + (u?.output_tokens ?? 0)).toLocaleString()}</b> tokens</span>
          </div>
          {!!data.daily?.length && (
            <div>
              <div style={subtleTextStyle}>Activity (last {data.daily.length} days)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40, marginTop: 4 }}>
                {data.daily.map((d) => {
                  const max = Math.max(...data.daily!.map((x) => x.n), 1);
                  return (
                    <div key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, height: `${Math.max(8, (d.n / max) * 100)}%`, background: "var(--accent, #5b6cff)", borderRadius: 2 }} />
                  );
                })}
              </div>
            </div>
          )}
          {!!data.skills?.length && (
            <div>
              <div style={subtleTextStyle}>Skills loaded ({data.skills.length})</div>
              <div style={{ fontSize: 11.5, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {data.skills.map((s) => (
                  <span key={`${s.category}/${s.name}`} style={{ background: "var(--surface-2, #222)", padding: "2px 6px", borderRadius: 3 }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!!data.memory && (
            <div>
              <div style={subtleTextStyle}>What it learned (MEMORY.md)</div>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", background: "var(--surface-2, #1a1a1a)", padding: 8, borderRadius: 4 }}>{data.memory}</pre>
            </div>
          )}
          {!!data.lastUserMessages?.length && (
            <div>
              <div style={subtleTextStyle}>Recent questions</div>
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
    <div style={{ border: "1px solid var(--border, #333)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Language trainer</div>
      <div style={subtleTextStyle}>
        On demand and hard-capped (6 pages / 12k chars / 120s). Reads curated public sources; add your own
        URLs below. Teaches the agent a reusable language pack — one model call, then it&apos;s cached.
      </div>
      <input
        style={inputStyle}
        placeholder="language, e.g. Brazilian Portuguese or Tagalog"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      />
      <textarea
        style={{ ...inputStyle, minHeight: 48 }}
        placeholder="optional extra source URLs (one per line, https only)"
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
      />
      <div>
        <button style={primaryButtonStyle} onClick={train} disabled={busy || !language.trim()}>
          {busy ? "Training…" : "Train language"}
        </button>
      </div>
      {err && <div style={{ color: "#b3261e", fontSize: 12 }}>{err}</div>}
      {result && <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", background: "var(--surface-2, #1a1a1a)", padding: 8, borderRadius: 4 }}>{result}</pre>}
    </div>
  );
}