import { NextRequest, NextResponse } from "next/server";

import { getApp } from "../../../../../../lib/app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.businessId !== "string" ||
    typeof body.phoneNumberId !== "string" ||
    typeof body.accessToken !== "string"
  ) {
    return NextResponse.json(
      { error: "businessId, phoneNumberId, and accessToken are required" },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    const result = await app.container.router.channels.connectWhatsapp(
      body.businessId,
      body.phoneNumberId,
      body.accessToken,
      typeof body.businessAccountId === "string" ? body.businessAccountId : undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
