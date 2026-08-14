import HomeClient from "./home-client";

// Statically-prerendered pages ship with year-long cache headers by
// default — every rebuild changes hashed JS/CSS chunk filenames, so a
// browser holding an old cached copy of this page keeps requesting
// chunks that no longer exist post-deploy (confirmed live: stray 404s
// + broken hydration + a redesign not showing up until a hard refresh).
// Nothing here needs prerendering anyway — it's 100% client-rendered —
// so force it dynamic instead. Route segment config only works from a
// Server Component, hence this file staying server-side and just
// rendering the real (client) page.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <HomeClient />;
}
