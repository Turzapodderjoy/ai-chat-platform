-- Add clientType to Contact
ALTER TABLE "Contact" ADD COLUMN "clientType" TEXT NOT NULL DEFAULT 'regular';
