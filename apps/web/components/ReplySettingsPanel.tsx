"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReplySettings } from "@ai-chat-platform/channel-catalog";
import {
  cardStyle,
  inputStyle,
  labelTextStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtleTextStyle,
} from "./dashboard-styles";

/** One place to see and change how the bot's replies are timed on
 * WhatsApp. Every number here used to be a hardcoded constant, so the
 * only way to change the delay was to edit code and redeploy.
 *
 * Two layers, because both were asked for: a platform-wide default (only
 * an admin session sees the editor for it) and this business's own
 * override on top. "Inheriting" is a first-class state — the override
 * starts empty, the form shows what the platform default resolves to,
 * and "Use platform default" clears the override rather than copying the
 * numbers down, so a later platform change still reaches this business.
 *
 * WhatsApp is the channel this actually affects: the official Cloud API
 * integration sends instantly by design, and only the unofficial
 * (Baileys/Evolution) connection simulates typing -- which exists to
 * avoid looking like a bot, so the "instant" option carries a warning
 * rather than being presented as simply faster. */

interface SettingsResponse {
  defaults: ReplySettings;
  platform: Partial<ReplySettings>;
  override: Partial<ReplySettings>;
  effective: ReplySettings;
  canEditPlatform: boolean;
}

type NumericKey = keyof ReplySettings;

/** Label, unit, step, and the per-field min/max. The ranges mirror the
 * clamps in channel-catalog's reply-settings.ts -- the UI stops you
 * typing a value the server would silently clamp, and the server still
 * clamps, so a hand-edited database row can't wedge a reply either. */
const FIELDS: {
  key: NumericKey;
  label: string;
  help: string;
  unit: "ms" | "s" | "x" | "";
  step: number;
  min: number;
  max: number;
  scale?: number;
}[] = [
  {
    key: "msPerWord",
    label: "Typing speed",
    help: "How long the “typing…” takes per word. Centre of a random range — it varies per word so it doesn't read as a machine.",
    unit: "ms",
    step: 10,
    min: 0,
    max: 5000,
  },
  {
    key: "wordJitter",
    label: "Speed variation",
    help: "How much the per-word speed wobbles. 0.35 = ±35%.",
    unit: "",
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    key: "minDelayMs",
    label: "Shortest wait before sending",
    help: "Floor for the pause before a message is sent.",
    unit: "ms",
    step: 100,
    min: 0,
    max: 60000,
  },
  {
    key: "maxDelayMs",
    label: "Longest wait before sending",
    help: "Ceiling for the pause. Set both waits to 0 to send instantly.",
    unit: "ms",
    step: 100,
    min: 0,
    max: 60000,
  },
  {
    key: "thinkPauseChance",
    label: "Chance of a mid-message pause",
    help: "How often the bot hesitates mid-sentence, like a person changing their mind. 0.2 = one reply in five.",
    unit: "",
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    key: "thinkPauseMinMs",
    label: "Shortest thinking pause",
    help: "Lower end of that hesitation.",
    unit: "ms",
    step: 50,
    min: 0,
    max: 60000,
  },
  {
    key: "thinkPauseMaxMs",
    label: "Longest thinking pause",
    help: "Upper end of that hesitation.",
    unit: "ms",
    step: 50,
    min: 0,
    max: 60000,
  },
  {
    key: "maxChunks",
    label: "Messages per reply",
    help: "A long answer is split into up to this many WhatsApp bubbles, sent one at a time with a typing pause between each.",
    unit: "",
    step: 1,
    min: 1,
    max: 10,
  },
  {
    key: "handoffStaleMinutes",
    label: "Keep a human in charge for",
    help: "After a handoff, the bot stays out of the conversation this long. An agent's own reply resets the clock; after it lapses the bot may answer again.",
    unit: "s",
    step: 15,
    min: 1,
    max: 10080,
  },
];

function formatValue(key: NumericKey, value: number): string {
  if (key === "handoffStaleMinutes") return formatDuration(value * 60_000);
  if (key === "wordJitter" || key === "thinkPauseChance") return `${Math.round(value * 100)}%`;
  if (key === "msPerWord") return `${value}ms/word`;
  if (key === "maxChunks") return `${value} ${value === 1 ? "message" : "messages"}`;
  return formatDuration(value);
}

function formatDuration(ms: number): string {
  if (ms === 0) return "0s (instant)";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s % 1 === 0 ? s : s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m % 1 === 0 ? m : m.toFixed(1)}min`;
  return `${(m / 60) % 1 === 0 ? m / 60 : (m / 60).toFixed(1)}h`;
}

/** Presets exist because the two settings people actually want are
 * "as before" and "as fast as possible" — and those are exactly the two
 * a row of eight sliders is worst at expressing. */
const PRESETS: { label: string; description: string; patch: Partial<ReplySettings> }[] = [
  {
    label: "Instant",
    description: "No typing indicator, no wait — every message goes out the moment it's ready.",
    patch: { msPerWord: 0, wordJitter: 0, minDelayMs: 0, maxDelayMs: 0, thinkPauseChance: 0, thinkPauseMinMs: 0, thinkPauseMaxMs: 0 },
  },
  {
    label: "Natural",
    description: "The previous behaviour: a realistic typing pause, 0.9–7.5s per message.",
    patch: { msPerWord: 230, wordJitter: 0.35, minDelayMs: 900, maxDelayMs: 7500, thinkPauseChance: 0.2, thinkPauseMinMs: 400, thinkPauseMaxMs: 1300 },
  },
];

/** `businessId` is optional on purpose: the client dashboard passes it
 *  (this business's override + the platform default), and the mother
  * dashboard omits it to show the platform default alone. */
export default function ReplySettingsPanel({ businessId }: { businessId?: string }) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Partial<ReplySettings>>({});
  const [platformDraft, setPlatformDraft] = useState<Partial<ReplySettings>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    const res = await fetch(`/api/reply-settings${query}`);
    if (!res.ok) {
      setError("Could not load reply settings.");
      return;
    }
    const next: SettingsResponse = await res.json();
    setData(next);
    setDraft(next.override);
    setPlatformDraft(next.platform);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showBusiness = !!businessId;

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/reply-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.status === 403 ? "You don't have access to these settings." : "Save failed.");
        return;
      }
      await load();
      setSaved(true);
    } catch {
      setError("Save failed — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <p style={subtleTextStyle}>{error ?? "Loading reply settings…"}</p>;
  }

  const isInstant = draft.minDelayMs === 0 && draft.maxDelayMs === 0;
  const inherits = Object.keys(data.override).length === 0;
  const shown = (key: NumericKey, source: Partial<ReplySettings> = draft) =>
    source[key] ?? data.effective[key] ?? data.defaults[key];
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.override);

  return (
    <div>
      {showBusiness && (
      <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>WhatsApp reply timing</h3>
        <p style={{ ...subtleTextStyle, marginBottom: 12 }}>
          Applies to replies on the unofficial WhatsApp connection. The official WhatsApp Business
          API always sends instantly — it is a bot channel by design and needs no pacing.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              title={preset.description}
              style={secondaryButtonStyle}
              onClick={() => setDraft({ ...data.override, ...preset.patch })}
              disabled={saving}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {isInstant && Object.keys(draft).length > 0 && (
          <p
            style={{
              ...subtleTextStyle,
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: "var(--radius-sm, 8px)",
              background: "var(--warning-subtle, rgba(234, 179, 8, 0.12))",
              color: "var(--text)",
            }}
          >
            Replies will go out instantly, with no “typing…” indicator. This connection is an unofficial
            WhatsApp bridge, and instant unbroken replies are exactly the pattern WhatsApp flags —
            there is a real risk of the number being restricted. If that happens, switch back to
            Natural.
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {FIELDS.map((field) => {
            const value = shown(field.key);
            return (
              <label key={field.key} style={{ display: "block" }}>
                <span style={{ ...labelTextStyle, display: "block" }}>{field.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={value}
                    onChange={(e) => setDraft({ ...draft, [field.key]: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: "var(--accent, #2563eb)" }}
                  />
                  <span style={{ fontSize: 12, minWidth: 96, textAlign: "right", color: "var(--text-muted)" }}>
                    {formatValue(field.key, value)}
                  </span>
                </div>
                <span style={{ ...subtleTextStyle, fontSize: 11, display: "block" }}>{field.help}</span>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => save({ businessId: businessId!, settings: draft })}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : inherits ? "Save as this business's own" : "Save"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => save({ businessId: businessId!, settings: null })}
            disabled={saving || inherits}
          >
            Use platform default
          </button>
          {dirty && (
            <button type="button" style={secondaryButtonStyle} onClick={() => setDraft(data.override)} disabled={saving}>
              Discard changes
            </button>
          )}
          {saved && <span style={{ ...subtleTextStyle, color: "var(--success)" }}>Saved — applies to the next reply.</span>}
          {error && <span style={{ ...subtleTextStyle, color: "var(--danger)" }}>{error}</span>}
        </div>

        <p style={{ ...subtleTextStyle, fontSize: 11, marginTop: 10 }}>
          {inherits
            ? "Currently using the platform default."
            : "Currently using this business's own values."}{" "}
          A 3-bubble reply on these settings takes roughly{" "}
          {formatDuration(estimateThreeBubbleMs(data.effective))}.
        </p>
      </div>
      )}

      {data.canEditPlatform && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Platform default</h3>
          <p style={{ ...subtleTextStyle, marginBottom: 12 }}>
            What every business gets unless it sets its own. Changing this does not touch businesses
            that have already saved their own values.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {FIELDS.map((field) => {
              const value = platformDraft[field.key] ?? data.platform[field.key] ?? data.defaults[field.key];
              return (
                <label key={field.key} style={{ display: "block" }}>
                  <span style={{ ...labelTextStyle, display: "block" }}>{field.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      onChange={(e) => setPlatformDraft({ ...platformDraft, [field.key]: Number(e.target.value) })}
                      style={{ flex: 1, accentColor: "var(--accent, #2563eb)" }}
                    />
                    <span style={{ fontSize: 12, minWidth: 96, textAlign: "right", color: "var(--text-muted)" }}>
                      {formatValue(field.key, value)}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={() => save({ platform: platformDraft })}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save platform default"}
            </button>
            <button type="button" style={secondaryButtonStyle} onClick={() => save({ platform: null })} disabled={saving}>
              Reset to built-in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Rough wall-clock for a three-bubble reply, so the panel can say what
 * a setting actually costs a customer instead of leaving them to
 * multiply milliseconds in their head. Uses the mid-point of the range
 * and the average number of bubbles (2), ignoring the per-word
 * randomness. */
function estimateThreeBubbleMs(settings: ReplySettings): number {
  const words = 12; // a typical short reply
  const perBubble =
    settings.msPerWord * words +
    (settings.minDelayMs + settings.maxDelayMs) / 2 / 2 +
    settings.thinkPauseChance * ((settings.thinkPauseMinMs + settings.thinkPauseMaxMs) / 2);
  return perBubble * 2;
}
