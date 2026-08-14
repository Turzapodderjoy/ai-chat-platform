import DashboardClient from "./dashboard-client";

// See app/page.tsx's own comment — static prerendering here ships a
// year-long cache header on a page that's 100% client-rendered anyway,
// which breaks after every deploy once hashed chunk filenames change.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardClient />;
}
