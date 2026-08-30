"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  in_repair: "In Repair",
  ready: "Ready for Pickup",
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

const STEPS = ["Booked", "Received", "In Repair", "Ready for Pickup", "Completed"];

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

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await fetch("/api/repairs/track/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: reply }),
      });
      setReply("");
      // Refetch messages
      const res = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      setMessages(data.messages || []);
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
        setRescheduleMsg("Reschedule request sent!");
        setRescheduleDate("");
        // Refetch
        const data = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`).then((r) => r.json());
        setAppointment(data.appointment);
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
        setCancelMsg("Cancellation request sent!");
        setCancelReason("");
        const data = await fetch(`/api/repairs/track?token=${encodeURIComponent(token)}`).then((r) => r.json());
        setAppointment(data.appointment);
      }
    } catch {
      setCancelMsg("Failed to send request.");
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>Repair Not Found</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{error}</p>
          <a href="/track" style={{ color: "var(--accent)", fontWeight: 500 }}>Try another code</a>
        </div>
      </div>
    );
  }

  const currentStep = STATUS_STEP[appointment.status] ?? -1;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <a href="/track" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>&larr; Track another repair</a>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: "var(--text)" }}>Repair Status</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            {appointment.deviceType}{appointment.deviceModel ? ` ${appointment.deviceModel}` : ""}
          </p>
        </div>

        {/* Status Timeline */}
        {appointment.status !== "cancelled" && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
              {/* Progress line */}
              <div style={{ position: "absolute", top: 12, left: 0, right: 0, height: 2, background: "var(--border)" }} />
              <div style={{ position: "absolute", top: 12, left: 0, height: 2, background: "var(--accent)", width: `${Math.min(100, (currentStep / (STEPS.length - 1)) * 100)}%`, transition: "width 0.3s" }} />
              {STEPS.map((step, i) => (
                <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: i <= currentStep ? "var(--accent)" : "var(--surface)",
                    border: `2px solid ${i <= currentStep ? "var(--accent)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: i <= currentStep ? "white" : "var(--text-muted)",
                    fontWeight: 600, marginBottom: 6,
                  }}>
                    {i < currentStep ? "\u2713" : i + 1}
                  </div>
                  <span style={{ fontSize: 10, color: i <= currentStep ? "var(--text)" : "var(--text-muted)", textAlign: "center", maxWidth: 60 }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
              Current status: {STATUS_LABEL[appointment.status]}
            </div>
          </div>
        )}

        {appointment.status === "cancelled" && (
          <div style={{ background: "var(--danger-subtle)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16, textAlign: "center" }}>
            <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>This repair has been cancelled</span>
          </div>
        )}

        {/* Appointment Details */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div><span style={{ color: "var(--text-muted)" }}>Customer</span><br />{appointment.customerName}</div>
            <div><span style={{ color: "var(--text-muted)" }}>Phone</span><br />{appointment.phone}</div>
            <div><span style={{ color: "var(--text-muted)" }}>Device</span><br />{appointment.deviceType}{appointment.deviceModel ? ` ${appointment.deviceModel}` : ""}</div>
            <div><span style={{ color: "var(--text-muted)" }}>Appointment</span><br />{new Date(appointment.appointmentDate).toLocaleDateString()}</div>
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-muted)" }}>Issue</span><br />{appointment.issueDescription}</div>
          </div>

          {/* Device Photos */}
          {appointment.deviceImages && appointment.deviceImages.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Device Photos</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {appointment.deviceImages.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`Device photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reschedule Request */}
        {appointment.status !== "cancelled" && appointment.status !== "completed" && !appointment.rescheduleRequested && !appointment.cancelRequested && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Request Changes</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="datetime-local"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                style={{ padding: 8, fontSize: 13, flex: 1, minWidth: 200 }}
              />
              <button onClick={requestReschedule} disabled={!rescheduleDate} style={{ padding: "8px 16px", fontSize: 13, background: rescheduleDate ? "var(--accent)" : "var(--surface-hover)", color: rescheduleDate ? "white" : "var(--text-muted)", border: "none", borderRadius: "var(--radius-sm)", cursor: rescheduleDate ? "pointer" : "not-allowed" }}>
                Request Reschedule
              </button>
            </div>
            {rescheduleMsg && <p style={{ fontSize: 12, color: "var(--success)", marginTop: 8 }}>{rescheduleMsg}</p>}

            <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)"
                style={{ padding: 8, fontSize: 13, width: "100%", marginBottom: 8 }}
              />
              <button onClick={requestCancel} style={{ padding: "8px 16px", fontSize: 13, background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
                Request Cancellation
              </button>
              {cancelMsg && <p style={{ fontSize: 12, color: "var(--success)", marginTop: 8 }}>{cancelMsg}</p>}
            </div>
          </div>
        )}

        {appointment.rescheduleRequested && (
          <div style={{ background: "var(--warning-subtle)", border: "1px solid var(--warning)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16, fontSize: 13 }}>
            <strong>Reschedule pending</strong> — Your request for {appointment.rescheduleNewDate ? new Date(appointment.rescheduleNewDate).toLocaleString() : "a new date"} is being reviewed.
          </div>
        )}

        {appointment.cancelRequested && (
          <div style={{ background: "var(--danger-subtle)", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16, fontSize: 13 }}>
            <strong>Cancellation pending</strong> — Your request is being reviewed.
          </div>
        )}

        {/* Message Thread */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Messages</h3>
          <div style={{ minHeight: 100, maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {messages.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No messages yet.</p>}
            {messages.map((m) => {
              if (m.role === "system") {
                return (
                  <div key={m.id} style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>
                    {m.content}
                  </div>
                );
              }
              const isCustomer = m.role === "user";
              return (
                <div key={m.id} style={{ maxWidth: "80%", alignSelf: isCustomer ? "flex-end" : "flex-start" }}>
                  <div style={{
                    background: isCustomer ? "var(--accent)" : "var(--surface-hover)",
                    color: isCustomer ? "white" : "var(--text)",
                    borderRadius: isCustomer ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                    padding: "8px 12px",
                    fontSize: 13,
                  }}>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
              placeholder="Type a message..."
              style={{ flex: 1, padding: 10, fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--text)" }}
            />
            <button onClick={sendReply} disabled={sending || !reply.trim()} style={{ padding: "10px 16px", fontSize: 13, background: reply.trim() ? "var(--accent)" : "var(--surface-hover)", color: reply.trim() ? "white" : "var(--text-muted)", border: "none", borderRadius: "var(--radius-sm)", cursor: reply.trim() ? "pointer" : "not-allowed" }}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
