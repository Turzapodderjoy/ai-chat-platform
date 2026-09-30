-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "replySettings" TEXT;

-- CreateTable
CREATE TABLE "public"."PlatformReplySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "settings" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformReplySettings_pkey" PRIMARY KEY ("id")
);

