"use client";

import { useEffect, useState } from "react";


interface Account {
  id: string;
  username: string;
  password: string | null;
}

function AccountRow({ account, label, onSaved }: { account: Account; label: string; onSaved: () => void }) {
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setUsername(account.username), [account.username]);

  async function save() {
    const body: { id: string; username?: string; password?: string } = { id: account.id };
    if (username.trim() && username.trim() !== account.username) body.username = username.trim();
    if (password.trim()) body.password = password.trim();
    if (!body.username && !body.password) return;

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/client/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Couldn't save.");
        return;
      }
      setPassword("");
      setMessage("Saved.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">{label}</span>
      </div>
      <div className="panel-body">
        <div className="toolbar" style={{ marginBottom: 0, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="instrument-label">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 170 }}>
            <span className="instrument-label">Current password</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={showPassword ? (account.password ?? "(unavailable — reset to see it)") : "••••••••"}
                readOnly
                aria-label="Current password"
                style={{ color: showPassword ? undefined : "var(--ink-4)" }}
              />
              <button type="button" className="ghost sm" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span className="instrument-label">New password</span>
            <input
              type="text"
              placeholder="Optional — blank keeps current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button onClick={save} disabled={saving} className="primary">
            {saving ? "Saving…" : "Save login"}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 10 }}>
            {message === "Saved." ? (
              <span className="lamp lamp-ok">{message}</span>
            ) : (
              <span className="lamp lamp-err">{message}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// The full IANA zone list, straight from the runtime -- no reason to
// hand-curate a shorter one and risk missing a zone a client needs.
const TIMEZONE_OPTIONS: string[] =
  typeof Intl !== "undefined" && "supportedValuesOf" in Intl
    ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone")
    : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"];

// GMT offset only, per request -- no zone/city name in the visible label
// (the IANA id is still the option's value underneath, so selection and
// the actual saved timezone are unaffected).
function gmtOffsetMinutes(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date());
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function gmtOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT ${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// Hundreds of IANA zones collapse onto only ~35 distinct current offsets --
// dozens of "GMT -6" entries with nothing to tell them apart was worse than
// the plain zone list it replaced. One dropdown entry per distinct offset,
// each still saving a real IANA id (the first zone found at that offset)
// so the underlying interpretation stays correct.
const TIMEZONE_LABELS: [string, string][] = (() => {
  const seen = new Map<number, string>();
  for (const tz of TIMEZONE_OPTIONS) {
    const minutes = gmtOffsetMinutes(tz);
    if (!seen.has(minutes)) seen.set(minutes, tz);
  }
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, tz]): [string, string] => [tz, gmtOffsetLabel(minutes)]);
})();

/** Saved on the Business row itself (not per-device/browser), so it
 * sticks for every user of this client's dashboard and persists across
 * sessions until changed again -- used to correctly interpret AI-booked
 * repair appointment times (see chat-service.ts's parseDateTimeInZone). */
function TimezoneSetting({ businessId }: { businessId: string }) {
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    fetch(`/api/admin/clients/${businessId}`)
      .then((r) => r.json())
      .then((d: { timezone?: string }) => setTimezone(d.timezone ?? "America/New_York"));
  }, [businessId]);

  // Live preview so switching the dropdown shows the new zone's clock
  // immediately, instead of trusting the label alone.
  useEffect(() => {
    if (!timezone) return;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const tick = () => setClock(formatter.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  async function save(next: string) {
    setTimezone(next);
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/clients/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: next }),
      });
      setMessage(res.ok ? "Saved." : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (!timezone) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Timezone</span>
        {clock && (
          <span className="data" style={{ fontSize: 14, color: "var(--ink)" }}>{clock}</span>
        )}
      </div>
      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0 }}>
          Every date/time shown in this dashboard, and every AI-booked repair appointment, is
          interpreted in this timezone. Stays set until you change it again.
        </p>
        <label className="field" style={{ maxWidth: 300 }}>
          <span className="instrument-label">GMT offset</span>
          <select value={timezone} disabled={saving} onChange={(e) => save(e.target.value)}>
        {/* The saved zone might not be the one TIMEZONE_LABELS kept as the
            representative for its offset -- inject it so the dropdown
            never silently shows the wrong selection for a zone actually
            in use. */}
        {!TIMEZONE_LABELS.some(([tz]) => tz === timezone) && (
          <option value={timezone}>{gmtOffsetLabel(gmtOffsetMinutes(timezone))}</option>
        )}
        {TIMEZONE_LABELS.map(([tz, label]) => (
          <option key={tz} value={tz}>{label}</option>
        ))}
          </select>
        </label>
        {message && (
          <div style={{ marginTop: 10 }}>
            {message === "Saved." ? (
              <span className="lamp lamp-ok">{message}</span>
            ) : (
              <span className="lamp lamp-err">{message}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Self-service login management -- every client account can change its
 * own username/password here; an owner additionally sees and manages
 * every staff login under their own business. Passwords are revealed
 * from the server on load (see /api/client/user-settings), never typed
 * in from a client-side store. */
export function UserSettingsPanel({ active = true, businessId }: { active?: boolean; businessId?: string }) {
  const [self, setSelf] = useState<Account | null>(null);
  const [staff, setStaff] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    fetch("/api/client/user-settings")
      .then((r) => r.json())
      .then((d: { self: Account; staff: Account[] }) => {
        setSelf(d.self);
        setStaff(d.staff ?? []);
        setLoaded(true);
      });
  }

  useEffect(() => {
    if (active) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="panel">
        <div className="panel-head">
          <span className="instrument-label">User settings</span>
        </div>
        <div className="panel-body">
          <p className="meta" style={{ marginTop: 0 }}>
            Change your own login here. Changing a password signs that login out everywhere —
            you&apos;ll need the new one next time.
          </p>
          {!loaded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skeleton" style={{ height: 28 }} />
              <div className="skeleton" style={{ height: 28 }} />
            </div>
          )}
        </div>
      </section>

      {businessId && <TimezoneSetting businessId={businessId} />}

      {self && <AccountRow account={self} label="Your login" onSaved={refresh} />}

      {staff.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="instrument-label">Staff logins</span>
            <span className="data" style={{ fontSize: 11 }}>{staff.length} total</span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {staff.map((s) => (
              <AccountRow key={s.id} account={s} label={s.username} onSaved={refresh} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
