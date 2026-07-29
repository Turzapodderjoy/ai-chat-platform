import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  return NextResponse.json({ chats: app.container.router.admin.chatUsage() });
}
