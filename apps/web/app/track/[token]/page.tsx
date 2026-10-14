"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import styles from "./page.module.css";

interface Appointment {
  id: string;
  customerName: string;
  phone: string;
  email?: string;
  deviceType: string;
  deviceModel?: string;
  issueDescription: string;
  appointmentDate: string;
  status: string;
  priority: string;
  deviceImages: string[];
  rescheduleRequested: boolean;
  rescheduleNewDate?: string;
  cancelRequested: boolean;
  cancelReason?: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  received: "Received",
  in_repair: "In repair",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_STEP: Record<string, number> = {
  booked: 0,
  received: 1,
  in_repair: 2,
  ready: 3,
  completed: 4,
  cancelled: -1,
};

const STEPS = ["Booked", "Received", "In repair", "Ready for pickup", "Completed"];

function getStatusLamp(status: string): string {
  switch (status) {
    case "ready":
      return "lamp lampOk";
    case "completed":
      return "lamp lampOk";
    case "cancelled":
      return "lamp lampErr";
    case "in_repair":
      return "lamp lampInfo";
    case "received":
      return "lamp lampInfo";
    case "booked":
      return "lamp lampWarn";
    default:
      return "lamp";
  }
}

export default function TrackRepairPage() {
  const params = useParams();
  const token = params.token as string;
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleMsg, setRescheduleMsg] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelMsg, setCancelMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setAppointment(data.appointment);
        setMessages(data.messages || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Repair not found. Please check your tracking code.");
        setLoading(false);
      });
  }, [token]);

  async function sendReply(e?: React.FormEvent) {
    e?.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/repairs/track/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: reply }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to send message. Please try again.");
        return;
      }
      setReply("");
      const msgRes = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`);
      const data = await msgRes.json();
      setMessages(data.messages || []);
    } catch {
      setError("Network error — couldn't send message.");
    } finally {
      setSending(false);
    }
  }

  async function requestReschedule() {
    if (!rescheduleDate) return;
    setRescheduleMsg("");
    try {
      const res = await fetch(`/api/repairs/${encodeURIComponent(token)}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: new Date(rescheduleDate).toISOString() }),
      });
      if (res.ok) {
        setRescheduleMsg("Reschedule request sent.");
        setRescheduleDate("");
        const data = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`).then((r) => r.json());
        setAppointment(data.appointment);
      } else {
        setRescheduleMsg("Failed to send request.");
      }
    } catch {
      setRescheduleMsg("Failed to send request.");
    }
  }

  async function requestCancel() {
    setCancelMsg("");
    try {
      const res = await fetch(`/api/repairs/${encodeURIComponent(token)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });
      if (res.ok) {
        setCancelMsg("Cancellation request sent.");
        setCancelReason("");
        const data = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`).then((r) => r.json());
        setAppointment(data.appointment);
      } else {
        setCancelMsg("Failed to send request.");
      }
    } catch {
      setCancelMsg("Failed to send request.");
    }
  }

  if (loading) {
    return (
      <main className="public-shell">
        <div className={styles.page}>
          <div className={styles.wrap}>
            <div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ width: 120, height: 14 }} />
            <div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ width: 200, height: 18 }} />
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <span className="instrument-label">Repair status</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.progress}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.progressStep}>
                      <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
                      <div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ width: 40, height: 8 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !appointment) {
    return (
      <main className="public-shell">
        <div className={styles.page}>
          <div className={styles.wrap} style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
            <div className={styles.card} style={{ textAlign: "center", padding: 32 }}>
              <h1 className={styles.title}>Repair not found</h1>
              <p className={styles.sub} role="alert">
                {error || "We couldn’t find a repair for this tracking code."}
              </p>
              <a href="/track" className={styles.button} style={{ alignSelf: "center" }}>
                Try another code
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const currentStep = STATUS_STEP[appointment.status] ?? -1;

  return (
    <main className="public-shell">
      <div className={styles.page}>
        <div className={styles.wrap}>
          <a href="/track" className={styles.backLink}>
            Back to tracking
          </a>
          <div className={styles.header}>
            <h1 className={styles.title}>Repair status</h1>
            <p className={styles.sub}>
              {appointment.deviceType}
              {appointment.deviceModel ? ` ${appointment.deviceModel}` : ""}
            </p>
          </div>

          {appointment.status !== "cancelled" && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span className="instrument-label">Progress</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.progress}>
                  <div className={styles.progressLine} />
                  <div
                    className={styles.progressLineFill}
                    style={{ width: `${Math.min(100, currentStep >= 0 ? (currentStep / (STEPS.length - 1)) * 100 : 0)}%` }}
                  />
                  {STEPS.map((step, i) => {
                    const done = i < currentStep;
                    const active = i === currentStep;
                    return (
                      <div key={step} className={styles.progressStep}>
                        <div
                          className={`${styles.progressDot} ${done ? styles.progressDotDone : ""} ${
                            active ? styles.progressDotActive : ""
                          }`}
                          aria-hidden="true"
                        >
                          {done ? "✓" : i + 1}
                        </div>
                        <span
                          className={`${styles.progressLabel} ${active || done ? styles.progressLabelActive : ""}`}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.statusRow}>
                  <span className={getStatusLamp(appointment.status)}>
                    {STATUS_LABEL[appointment.status]}
                  </span>
                </div>
              </div>
            </section>
          )}

          {appointment.status === "cancelled" && (
            <div className={`${styles.msgBox} ${styles.msgError}`} role="status">
              <span className={styles.msgTitle}>This repair has been cancelled</span>
              {appointment.cancelReason && (
                <span className={styles.data}>{appointment.cancelReason}</span>
              )}
            </div>
          )}

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <span className="instrument-label">Repair details</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.grid}>
                <div className={styles.gridItem}>
                  <span className={styles.meta}>Customer</span>
                  <span className={styles.data}>{appointment.customerName}</span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.meta}>Phone</span>
                  <span className={styles.data}>{appointment.phone}</span>
                </div>
                {appointment.email && (
                  <div className={styles.gridItem}>
                    <span className={styles.meta}>Email</span>
                    <span className={styles.data}>{appointment.email}</span>
                  </div>
                )}
                <div className={styles.gridItem}>
                  <span className={styles.meta}>Device</span>
                  <span className={styles.data}>
                    {appointment.deviceType}
                    {appointment.deviceModel ? ` ${appointment.deviceModel}` : ""}
                  </span>
                </div>
                <div className={styles.gridItem}>
                  <span className={styles.meta}>Appointment date</span>
                  <span className={styles.data}>
                    {new Date(appointment.appointmentDate).toLocaleString()}
                  </span>
                </div>
                <div className={`${styles.gridItem} ${styles.issue}`}>
                  <span className={styles.meta}>Issue</span>
                  <span className={styles.data}>{appointment.issueDescription}</span>
                </div>
              </div>

              {appointment.deviceImages && appointment.deviceImages.length > 0 && (
                <div className={styles.photos}>
                  <span className={styles.meta}>Device photos</span>
                  <div className={styles.photoGrid}>
                    {appointment.deviceImages.map((url, i) => (
                      <img key={i} src={url} alt={`Device photo ${i + 1}`} className={styles.photo} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {appointment.status !== "cancelled" && appointment.status !== "completed" && !appointment.rescheduleRequested && !appointment.cancelRequested && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <span className="instrument-label">Request changes</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.actions}>
                  <div className={styles.actionsRow}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="reschedule-date">
                        New date and time
                      </label>
                      <input
                        id="reschedule-date"
                        className={styles.input}
                        type="datetime-local"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />
                    </div>
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      onClick={requestReschedule}
                      disabled={!rescheduleDate}
                    >
                      Request a new date
                    </button>
                  </div>
                  {rescheduleMsg && (
                    <div className={`${styles.msgBox} ${styles.msgSuccess}`}>
                      <span>{rescheduleMsg}</span>
                    </div>
                  )}

                  <div className={styles.divider} />

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="cancel-reason">
                      Reason for cancellation (optional)
                    </label>
                    <input
                      id="cancel-reason"
                      className={styles.input}
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g. can no longer drop off"
                    />
                  </div>
                  <div className={styles.actionsRow}>
                    <button
                      className={`${styles.button} ${styles.buttonDanger}`}
                      onClick={requestCancel}
                    >
                      Cancel this repair
                    </button>
                  </div>
                  {cancelMsg && (
                    <div className={`${styles.msgBox} ${styles.msgSuccess}`}>
                      <span>{cancelMsg}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {appointment.rescheduleRequested && (
            <div className={`${styles.msgBox} ${styles.msgWarn}`}>
              <span className={styles.msgTitle}>Reschedule pending</span>
              <span className={styles.data}>
                Request for
                {appointment.rescheduleNewDate
                  ? ` ${new Date(appointment.rescheduleNewDate).toLocaleString()}`
                  : " a new date"} is being reviewed.
              </span>
            </div>
          )}

          {appointment.cancelRequested && (
            <div className={`${styles.msgBox} ${styles.msgWarn}`}>
              <span className={styles.msgTitle}>Cancellation pending</span>
              <span className={styles.data}>Your request is being reviewed.</span>
            </div>
          )}

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <span className="instrument-label">Messages</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.thread}>
                {messages.length === 0 && (
                  <div className={styles.threadEmpty}>No messages yet.</div>
                )}
                {messages.map((m) => {
                  if (m.role === "system") {
                    return (
                      <div key={m.id} className={`${styles.bubble} ${styles.bubbleSystem}`}>
                        <div className={styles.bubbleContent}>
                          {m.content}
                        </div>
                      </div>
                    );
                  }
                  const isCustomer = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={`${styles.bubble} ${isCustomer ? styles.bubbleCustomer : styles.bubbleStaff}`}
                    >
                      <div className={styles.bubbleContent}>
                        {m.content}
                      </div>
                      <span className={`${styles.meta} ${styles.dataSmall} ${isCustomer ? styles.bubbleCustomer : styles.bubbleStaff}`}>
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              <form className={styles.replyRow} onSubmit={sendReply}>
                <div className={`${styles.field} ${styles.replyInput}`}>
                  <label className={styles.label} htmlFor="reply">
                    Message
                  </label>
                  <input
                    id="reply"
                    className={styles.input}
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a message..."
                    disabled={sending}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  disabled={sending || !reply.trim()}
                >
                  {sending ? "Sending" : "Send message"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
