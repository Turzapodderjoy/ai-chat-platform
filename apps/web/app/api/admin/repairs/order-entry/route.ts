import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../lib/app";
import { resolveAdminActor } from "../../../../../lib/admin-actor";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.customerName !== "string" ||
    typeof body.phone !== "string" ||
    typeof body.deviceType !== "string" ||
    typeof body.issueDescription !== "string"
  ) {
    return NextResponse.json(
      { error: "businessId, customerName, phone, deviceType, and issueDescription are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const actorUsername = await resolveAdminActor(req);
    const appointment = await app.container.router.repairs.createOrderEntry({
      businessId: body.businessId,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      customerName: body.customerName,
      phone: body.phone,
      email: typeof body.email === "string" ? body.email : undefined,
      deviceType: body.deviceType,
      deviceModel: typeof body.deviceModel === "string" ? body.deviceModel : undefined,
      issueDescription: body.issueDescription,
      items: Array.isArray(body.items)
        ? body.items
            .filter((i: unknown): i is { kind: string; name: string; quantity: number; defaultPrice: number } =>
              !!i && typeof i === "object" && typeof (i as { name?: unknown }).name === "string" && (i as { name: string }).name.trim() !== ""
            )
            .map((i: { kind: string; name: string; quantity: number; defaultPrice: number; productId?: string; costPrice?: number }) => ({
              kind: i.kind === "part" ? "part" as const : "service" as const,
              name: i.name,
              quantity: Number(i.quantity) || 1,
              defaultPrice: Number(i.defaultPrice) || 0,
              productId: typeof i.productId === "string" && i.productId ? i.productId : undefined,
              costPrice: typeof i.costPrice === "number" ? i.costPrice : undefined,
            }))
        : undefined,
    }, actorUsername);
    return NextResponse.json(appointment);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
