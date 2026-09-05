import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

export async function GET(req: NextRequest) {
  const adminSession = req.cookies.get("admin_session")?.value;
  if (!adminSession || !verifyAdminToken(adminSession)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  });
}

export async function PUT(req: NextRequest) {
  const adminSession = req.cookies.get("admin_session")?.value;
  if (!adminSession || !verifyAdminToken(adminSession)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin";
  if (currentPassword !== adminPassword) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  return NextResponse.json({ error: "Password change requires server restart. Update ADMIN_PASSWORD in your .env file and restart the service." }, { status: 400 });
}
