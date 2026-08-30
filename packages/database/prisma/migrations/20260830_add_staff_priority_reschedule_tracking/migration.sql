-- Add repair shop management features
-- Run this migration on your production database

-- 1. Staff table
CREATE TABLE "Staff" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "role" TEXT NOT NULL DEFAULT 'technician',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Staff_businessId_idx" ON "Staff"("businessId");

-- 2. Extend RepairAppointment with new fields
ALTER TABLE "RepairAppointment" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "RepairAppointment" ADD COLUMN "technicianId" TEXT;
ALTER TABLE "RepairAppointment" ADD COLUMN "deviceImages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RepairAppointment" ADD COLUMN "rescheduleRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepairAppointment" ADD COLUMN "rescheduleNewDate" TIMESTAMP(3);
ALTER TABLE "RepairAppointment" ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepairAppointment" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "RepairAppointment" ADD COLUMN "cost" DOUBLE PRECISION;
ALTER TABLE "RepairAppointment" ADD COLUMN "warranty" TEXT;
ALTER TABLE "RepairAppointment" ADD COLUMN "notes" TEXT;

-- 3. Extend Product with category and minStock
ALTER TABLE "Product" ADD COLUMN "category" TEXT;
ALTER TABLE "Product" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 0;
