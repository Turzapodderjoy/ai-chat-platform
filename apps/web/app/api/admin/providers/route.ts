import { NextResponse } from "next/server";

import { getApp } from "../../../../lib/app";

export async function GET() {
  const app = await getApp();
  const admin = app.container.router.admin;

  const result = await admin.providers();
  const labelMap = await admin.customProviderLabelMap();

  return NextResponse.json({
    ...result,
    status: result.status.map((s) => ({
      ...s,
      label: labelMap.get(s.name) ?? null,
    })),
    catalog: admin.catalog(),
  });
}
