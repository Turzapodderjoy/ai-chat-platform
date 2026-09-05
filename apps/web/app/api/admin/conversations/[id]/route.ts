import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-chat-platform/database";
import { verifyAdminToken } from "@ai-chat-platform/client-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminSession = req.cookies.get("admin_session")?.value;
  if (!adminSession || !verifyAdminToken(adminSession)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.message.deleteMany({
      where: { conversationId: id },
    });

    await prisma.conversation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
