export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
}

/** Thin wrapper over Resend's HTTP API — a single `fetch` call, no SDK
 * dependency needed for one endpoint. Never throws: a missing API key
 * or a failed send is logged and returned as `{ ok: false }` so nothing
 * that triggered an email (e.g. booking an appointment) ever fails
 * because of it. */
export class ResendEmailClient {
  async send(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("[ResendEmailClient] RESEND_API_KEY not set — skipping email send.");
      return { ok: false, error: "RESEND_API_KEY not set" };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: input.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[ResendEmailClient] send failed: ${res.status} ${body}`);
        return { ok: false, error: `${res.status} ${body}` };
      }

      return { ok: true };
    } catch (err) {
      console.error("[ResendEmailClient] send threw:", err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
