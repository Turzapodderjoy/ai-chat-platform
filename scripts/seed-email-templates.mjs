#!/usr/bin/env node
/**
 * Seeds professional email templates for repair status changes.
 * Usage: node scripts/seed-email-templates.mjs <businessId>
 *
 * Creates 6 templates (one per repair status) with professional HTML
 * designs. Uses upsert so it's safe to run multiple times.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const businessId = process.argv[2];
if (!businessId) {
  console.error("Usage: node scripts/seed-email-templates.mjs <businessId>");
  process.exit(1);
}

const BRAND_COLOR = "#4F46E5";
const BRAND_NAME = "PhoneRepairZoneAZ";

function wrapHtml(content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.3px;">${BRAND_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                This is an automated notification from ${BRAND_NAME}.<br>
                Tracking code: <strong>{{trackingToken}}</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const templates = [
  {
    statusValue: "booked",
    subject: "Your repair appointment is booked - {{deviceType}}",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Appointment Confirmed</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, we've received your repair request.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#059669;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">Please bring your device to our shop at your scheduled time. If you need to reschedule, reply to this message.</p>
    `),
  },
  {
    statusValue: "received",
    subject: "We've received your {{deviceType}}",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Device Received</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, we've received your device and it's ready for inspection.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#2563eb;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">Our technician will begin assessing your device shortly. We'll notify you when the repair starts.</p>
    `),
  },
  {
    statusValue: "in_repair",
    subject: "Your {{deviceType}} repair is in progress",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Repair In Progress</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, a technician is now working on your device.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#d97706;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">We'll let you know as soon as your device is ready for pickup.</p>
    `),
  },
  {
    statusValue: "ready",
    subject: "Your {{deviceType}} is ready for pickup!",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Ready for Pickup</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, great news! Your device repair is complete.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #bbf7d0;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#16a34a;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">Please visit us at your earliest convenience to collect your device. Bring your tracking code for reference.</p>
    `),
  },
  {
    statusValue: "completed",
    subject: "Repair completed - {{deviceType}}",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Repair Complete</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, your repair has been completed and your device has been returned.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #bbf7d0;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#16a34a;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">Thank you for choosing ${BRAND_NAME}! If you have any questions about your repair, don't hesitate to reach out.</p>
    `),
  },
  {
    statusValue: "cancelled",
    subject: "Repair cancelled - {{deviceType}}",
    body: wrapHtml(`
      <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Repair Cancelled</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi {{customerName}}, your repair appointment has been cancelled.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;padding:20px;margin-bottom:24px;border:1px solid #fecaca;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Device</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{{deviceType}}{{#if deviceModel}} ({{deviceModel}}){{/if}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Status</td>
          <td style="padding:8px 0;color:#dc2626;font-size:14px;font-weight:600;text-align:right;">{{statusLabel}}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:15px;">If this was a mistake, please contact us to reschedule.</p>
    `),
  },
];

async function main() {
  console.log(`Seeding email templates for business: ${businessId}`);

  for (const t of templates) {
    await prisma.statusEmailTemplate.upsert({
      where: {
        businessId_kind_statusValue: {
          businessId,
          kind: "repair_status",
          statusValue: t.statusValue,
        },
      },
      update: { subject: t.subject, bodyHtml: t.body, enabled: true },
      create: {
        businessId,
        kind: "repair_status",
        statusValue: t.statusValue,
        subject: t.subject,
        bodyHtml: t.body,
        enabled: true,
      },
    });
    console.log(`  ✓ ${t.statusValue}`);
  }

  console.log("Done! All 6 templates seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
