// Small, hand-authored stroke-icon set for the dashboard sidebars — one
// consistent 18x18 style (no icon library dependency) instead of the
// bare text labels the sidebar used to render. Falls back to a plain
// dot for any nav id not mapped below, so adding a new tab never breaks.
import type { ReactElement, SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

const ICONS: Record<string, (p: SVGProps<SVGSVGElement>) => ReactElement> = {
  overview: (p) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  ),
  tagdashboard: (p) => (
    <Svg {...p}>
      <path d="M4 19V10M11 19V5M18 19v-7" />
    </Svg>
  ),
  clients: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.4.3 4.5 2.3 4.5 5.8" />
    </Svg>
  ),
  access: (p) => (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.6" />
    </Svg>
  ),
  brain: (p) => (
    <Svg {...p}>
      <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 2.8A3 3 0 0 0 5 15a3.2 3.2 0 0 0 3 3.4V19a2 2 0 0 0 4 0V6a2 2 0 0 0-3-2Z" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 2.8A3 3 0 0 1 19 15a3.2 3.2 0 0 1-3 3.4V19a2 2 0 0 1-4 0V6a2 2 0 0 1 3-2Z" />
    </Svg>
  ),
  parameters: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10c.1.7.6 1.3 1.3 1.5h.3a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" />
    </Svg>
  ),
  arena: (p) => (
    <Svg {...p}>
      <path d="M6.5 3v3.5M17.5 3v3.5M4 6.5h16v3a8 8 0 0 1-16 0v-3Z" />
      <path d="M12 17.5V21M9 21h6" />
    </Svg>
  ),
  review: (p) => (
    <Svg {...p}>
      <path d="m9 12 2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  ),
  knowledge: (p) => (
    <Svg {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
      <path d="M8 7.5h8M8 11h8" />
    </Svg>
  ),
  allchats: (p) => (
    <Svg {...p}>
      <path d="M4 5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-5 4V5Z" />
    </Svg>
  ),
  handoffs: (p) => (
    <Svg {...p}>
      <path d="M8 9h8M8 13h5" />
      <path d="M21 12a9 9 0 1 1-4-7.5" />
      <path d="m21 3-5 5-2-2" />
    </Svg>
  ),
  storage: (p) => (
    <Svg {...p}>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5V12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5" />
      <path d="M4 12v6.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V12" />
    </Svg>
  ),
  channels: (p) => (
    <Svg {...p}>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="5.5" r="2.4" />
      <circle cx="18" cy="18.5" r="2.4" />
      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
    </Svg>
  ),
  ai: (p) => (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <circle cx="9" cy="13.5" r="1.1" fill="currentColor" />
      <circle cx="15" cy="13.5" r="1.1" fill="currentColor" />
    </Svg>
  ),
  embedding: (p) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.2 16 7.2M7.5 8.2 11 16M16.5 8.2 13 16" />
    </Svg>
  ),
  usage: (p) => (
    <Svg {...p}>
      <path d="M4 19V10M11 19V5M18 19v-7" />
      <path d="M2 19h20" />
    </Svg>
  ),
  database: (p) => (
    <Svg {...p}>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5V18.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5" />
      <path d="M20 12c0 1.5-3.6 2.8-8 2.8s-8-1.3-8-2.8" />
    </Svg>
  ),
  tags: (p) => (
    <Svg {...p}>
      <path d="M11.5 3H5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .6 1.4l8.5 8.5a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8l-8.5-8.5A2 2 0 0 0 11.5 3Z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </Svg>
  ),
  health: (p) => (
    <Svg {...p}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Svg>
  ),
  reports: (p) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </Svg>
  ),
  contacts: (p) => (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  deals: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M8 10h8M9 14h6" />
    </Svg>
  ),
  quotes: (p) => (
    <Svg {...p}>
      <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
      <polyline points="14,2 14,8 20,8" />
      <path d="M3 15h6M3 11h6" />
    </Svg>
  ),
  invoices: (p) => (
    <Svg {...p}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2Z" />
      <path d="M14 8H8M16 12H8M12 16H8" />
    </Svg>
  ),
  subscription: (p) => (
    <Svg {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Svg>
  ),
};

export function NavIcon({ id, ...rest }: { id: string } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[id];
  if (Icon) return Icon(rest);
  return (
    <Svg {...rest}>
      <circle cx="12" cy="12" r="3.2" />
    </Svg>
  );
}
