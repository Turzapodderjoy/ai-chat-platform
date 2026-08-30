import { prisma } from "@ai-chat-platform/database";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ieltsclarification.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

interface ExpiringBusiness {
  id: string;
  name: string;
  subscriptionEndDate: Date;
  subscriptionPlanName: string | null;
  subscriptionFee: number | null;
  subscriptionCurrency: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€" };

/**
 * Find businesses with subscriptions expiring within the next 7 days
 */
export async function getExpiringSubscriptions(): Promise<ExpiringBusiness[]> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const businesses = await prisma.business.findMany({
    where: {
      subscriptionActive: true,
      subscriptionEndDate: {
        not: null,
        gte: now,
        lte: sevenDaysFromNow,
      },
    },
    select: {
      id: true,
      name: true,
      subscriptionEndDate: true,
      subscriptionPlanName: true,
      subscriptionFee: true,
      subscriptionCurrency: true,
    },
  });

  // Prisma's generated type keeps subscriptionEndDate as Date | null even
  // though the "not: null" filter above guarantees it's set on every row.
  return businesses.map((b) => ({ ...b, subscriptionEndDate: b.subscriptionEndDate! }));
}

/**
 * Send email notification about expiring subscription
 */
export async function sendExpirationEmail(business: ExpiringBusiness): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("[Billing] RESEND_API_KEY not set, skipping email");
    return false;
  }

  const daysLeft = Math.ceil(
    (business.subscriptionEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const subject = `Subscription Expiring Soon - ${business.name}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111827; margin-bottom: 16px;">Subscription Expiring Soon</h2>
      <p style="color: #374151; line-height: 1.5;">
        Your subscription for <strong>${business.name}</strong> expires in <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong>.
      </p>
      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #374151;"><strong>Business:</strong> ${business.name}</p>
        ${business.subscriptionPlanName ? `<p style="margin: 4px 0; color: #374151;"><strong>Plan:</strong> ${business.subscriptionPlanName}</p>` : ""}
        ${business.subscriptionFee ? `<p style="margin: 4px 0; color: #374151;"><strong>Fee:</strong> ${CURRENCY_SYMBOLS[business.subscriptionCurrency] || business.subscriptionCurrency + " "}${business.subscriptionFee.toLocaleString()}/mo</p>` : ""}
        <p style="margin: 4px 0; color: #374151;"><strong>Expires:</strong> ${business.subscriptionEndDate.toLocaleDateString()}</p>
      </div>
      <p style="color: #374151; line-height: 1.5;">
        Please contact the business owner to renew their subscription. If not renewed, their access will be suspended after the grace period.
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
        This is an automated notification from the AI Chat Platform billing system.
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Chat Platform <notifications@ieltsclarification.com>",
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      console.error("[Billing] Failed to send email:", await response.text());
      return false;
    }

    console.log(`[Billing] Sent expiration email for ${business.name} (${daysLeft} days left)`);
    return true;
  } catch (error) {
    console.error("[Billing] Email send error:", error);
    return false;
  }
}

/**
 * Run the expiration notification job
 * Should be called every 6 hours via cron
 */
export async function runExpirationNotifications(): Promise<{ sent: number; failed: number }> {
  console.log("[Billing] Running expiration notification job...");

  const expiring = await getExpiringSubscriptions();
  console.log(`[Billing] Found ${expiring.length} businesses with expiring subscriptions`);

  let sent = 0;
  let failed = 0;

  for (const business of expiring) {
    const success = await sendExpirationEmail(business);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[Billing] Notification job complete: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}
