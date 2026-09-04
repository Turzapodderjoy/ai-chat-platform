// Client-side, per-browser "have I seen this appointment yet" tracking
// for the topbar notification bell -- no backend model, just
// localStorage scoped per business, dispatching a same-tab custom
// event (the native `storage` event only fires in OTHER tabs) so the
// bell and the Repairs panel's row-highlighting both react to changes
// made by whichever one is actually polling right now.

export interface AppointmentNotification {
  id: string;
  customerName: string;
  appointmentDate: string;
  issueDescription: string;
  detectedAt: string;
}

const EVENT = "aiva-notifications-updated";

function listKey(businessId: string) {
  return `aiva-appt-notifications-${businessId}`;
}
function knownKey(businessId: string) {
  return `aiva-appt-known-${businessId}`;
}

export function loadNotifications(businessId: string): AppointmentNotification[] {
  try {
    const raw = localStorage.getItem(listKey(businessId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotifications(businessId: string, list: AppointmentNotification[]) {
  try {
    localStorage.setItem(listKey(businessId), JSON.stringify(list.slice(0, 20)));
  } catch {
    // localStorage can throw (private mode, quota) -- notifications are
    // a convenience, never something to crash the dashboard over.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onNotificationsChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function dismissNotification(businessId: string, id: string): void {
  saveNotifications(businessId, loadNotifications(businessId).filter((n) => n.id !== id));
}

export function clearAllNotifications(businessId: string): void {
  saveNotifications(businessId, []);
}

export function isNewAppointment(businessId: string, id: string): boolean {
  return loadNotifications(businessId).some((n) => n.id === id);
}

/** Diffs the current appointment list against the last-known id set for
 * this business and returns any genuinely new ones (empty on the very
 * first-ever call for a business -- that call only records the
 * baseline, it never treats pre-existing appointments as "new"). */
export function checkForNewAppointments(
  businessId: string,
  appointments: { id: string; customerName: string; appointmentDate: string; issueDescription: string }[]
): AppointmentNotification[] {
  let known: string[] | null = null;
  try {
    const raw = localStorage.getItem(knownKey(businessId));
    known = raw ? JSON.parse(raw) : null;
  } catch {
    known = null;
  }

  try {
    localStorage.setItem(knownKey(businessId), JSON.stringify(appointments.map((a) => a.id)));
  } catch {
    // ignore -- see saveNotifications
  }

  if (known === null) return [];

  const knownSet = new Set(known);
  const fresh = appointments.filter((a) => !knownSet.has(a.id));
  if (fresh.length === 0) return [];

  const notifications: AppointmentNotification[] = fresh.map((a) => ({
    id: a.id,
    customerName: a.customerName,
    appointmentDate: a.appointmentDate,
    issueDescription: a.issueDescription,
    detectedAt: new Date().toISOString(),
  }));

  saveNotifications(businessId, [...notifications, ...loadNotifications(businessId)]);
  return notifications;
}

// Generic per-business "dismissed ids" set, shared by admin-sent and
// subscription-warning notifications in the bell (they have no
// appointment-diffing logic of their own -- just show/hide by id).
function dismissedKey(businessId: string, kind: string) {
  return `aiva-dismissed-${kind}-${businessId}`;
}

export function isDismissedId(businessId: string, kind: string, id: string): boolean {
  try {
    const raw = localStorage.getItem(dismissedKey(businessId, kind));
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.includes(id);
  } catch {
    return false;
  }
}

export function dismissId(businessId: string, kind: string, id: string): void {
  try {
    const raw = localStorage.getItem(dismissedKey(businessId, kind));
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) ids.push(id);
    localStorage.setItem(dismissedKey(businessId, kind), JSON.stringify(ids.slice(-50)));
  } catch {
    // see saveNotifications
  }
  window.dispatchEvent(new Event(EVENT));
}

// Two-note chime via Web Audio -- no bundled asset, works everywhere.
// ponytail: only fires while a tab with the dashboard open is active;
// real background delivery needs a service worker + Web Push
// subscription, a genuinely bigger feature, not added here.
export function playPingSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {
    // Audio can fail (autoplay policy before any user interaction) --
    // the visible bell badge still lands, sound is a bonus.
  }
}
