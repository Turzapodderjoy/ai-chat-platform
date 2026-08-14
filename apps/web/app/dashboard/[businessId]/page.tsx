import ClientDashboardClient from "./client-dashboard-client";

// See app/page.tsx's own comment — force-dynamic so a rebuild's new
// hashed chunk filenames don't get stranded behind an old cached HTML
// shell (this route was already server-rendered per-request due to the
// [businessId] param, so this mainly documents the same intent).
export const dynamic = "force-dynamic";

export default function ClientDashboardPage() {
  return <ClientDashboardClient />;
}
