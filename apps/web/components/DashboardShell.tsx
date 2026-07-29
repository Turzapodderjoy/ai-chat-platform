"use client";

import type { ReactNode } from "react";

export interface NavItem<T extends string> {
  id: T;
  label: string;
}

export interface NavGroup<T extends string> {
  /** Omit for top-level items shown without a section heading (e.g.
   * "Overview", "Clients"). */
  label?: string;
  items: NavItem<T>[];
}

/**
 * Shared sidebar + content layout for both dashboards — replaces the old
 * flat row of buttons (which wrapped across several lines once a
 * dashboard grew past ~6 tabs) with a fixed, grouped sidebar that scales
 * to any number of sections without getting visually noisy. Purely a
 * shell: every panel's own markup/data-fetching is unchanged, this only
 * changes what wraps around it.
 */
export function DashboardShell<T extends string>({
  sidebarLabel,
  groups,
  activeTab,
  onSelect,
  children,
}: {
  sidebarLabel: ReactNode;
  groups: NavGroup<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid #30363d",
          padding: "24px 0",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 16px 20px", fontSize: 13, fontWeight: 700, opacity: 0.7, letterSpacing: 0.3 }}>
          {sidebarLabel}
        </div>
        <nav>
          {groups.map((group, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              {group.label && (
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    opacity: 0.45,
                    padding: "0 16px",
                    marginBottom: 6,
                    letterSpacing: 0.6,
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 16px",
                      border: "none",
                      borderLeft: active ? "3px solid #58a6ff" : "3px solid transparent",
                      background: active ? "rgba(88,166,255,0.1)" : "transparent",
                      color: active ? "#58a6ff" : "inherit",
                      fontWeight: active ? 600 : 400,
                      fontSize: 13.5,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "32px 40px", maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
