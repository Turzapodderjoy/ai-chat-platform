-- Add visionMode to AiConfigVersion
ALTER TABLE "AiConfigVersion" ADD COLUMN "visionMode" TEXT NOT NULL DEFAULT 'current';
