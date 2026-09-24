import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@ai-chat-platform/database";

// Wave B #33 - Multi-location reporting. Rollup of location-scoped data.
// Today the only location-scoped entity is Shift (orders/repairs/inventory are
// not yet location-scoped), so this honestly reports shift + staff coverage per
// location. Header row notes the boundary so the report is not misread.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const [locations, shifts] = await Promise.all([
    prisma.location.findMany({ where: { businessId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.shift.findMany({ where: { businessId }, select: { locationId: true, staffId: true, startAt: true, endAt: true } }),
  ]);

  const now = new Date();
  const rows = locations.map((loc) => {
    const locShifts = shifts.filter((s) => s.locationId === loc.id);
    const upcoming = locShifts.filter((s) => s.startAt >= now);
    const activeNow = locShifts.filter((s) => s.startAt <= now && s.endAt >= now);
    return {
      id: loc.id,
      name: loc.name,
      city: loc.city,
      isActive: loc.isActive,
      shiftsTotal: locShifts.length,
      shiftsUpcoming: upcoming.length,
      shiftsActiveNow: activeNow.length,
      staffCount: new Set(locShifts.map((s) => s.staffId).filter((v): v is string => !!v)).size,
    };
  });

  const totalRow = rows.length
    ? rows.reduce((acc, r) => ({
        shiftsTotal: acc.shiftsTotal + r.shiftsTotal,
        shiftsUpcoming: acc.shiftsUpcoming + r.shiftsUpcoming,
        shiftsActiveNow: acc.shiftsActiveNow + r.shiftsActiveNow,
        staffCount: acc.staffCount + r.staffCount,
      }), { shiftsTotal: 0, shiftsUpcoming: 0, shiftsActiveNow: 0, staffCount: 0 })
    : null;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    rows,
    total: totalRow,
    scopeBoundary: "Shift-staff coverage only: orders/repairs/inventory are not location-scoped yet",
  });
}