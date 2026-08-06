"use client";

import { useState, type ReactNode } from "react";

import { NavIcon } from "./nav-icons";

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
 * Shared sidebar + content layout for both dashboards. Sidebar is
 * collapsible (to an icon-only rail) and each labeled group collapses
 * independently — both purely local UI state, reset on reload, since
 * neither needs to persist across sessions for an internal tool. Every
 * panel's own markup/data-fetching is unchanged; this only changes what
 * wraps around it. Wrapped in `.app-shell` so the dashboard design
 * tokens in globals.css apply here and nowhere else (the public login
 * page keeps its own separate light theme).
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
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});

  const activeLabel = groups.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? "";

  function toggleGroup(i: number) {
    setCollapsedGroups((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: collapsed ? 60 : 232,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          padding: "18px 0",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          transition: "width 0.15s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: collapsed ? "0 0 16px" : "0 14px 16px",
            gap: 8,
          }}
        >
          {!collapsed && (
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.2, minWidth: 0 }}>
              {sidebarLabel}
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="plain"
            style={{
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--text-muted)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {collapsed ? <path d="m9 5 7 7-7 7" /> : <path d="m15 5-7 7 7 7" />}
            </svg>
          </button>
        </div>

        <nav>
          {groups.map((group, i) => {
            const groupCollapsed = collapsedGroups[i];
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                {group.label && !collapsed && (
                  <button
                    onClick={() => toggleGroup(i)}
                    className="plain"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      fontSize: 11,
                      textTransform: "uppercase",
                      color: "var(--text-faint)",
                      padding: "6px 14px",
                      letterSpacing: 0.6,
                    }}
                  >
                    <span>{group.label}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      style={{ transform: groupCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.12s ease" }}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                )}
                {!groupCollapsed &&
                  group.items.map((item) => {
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelect(item.id)}
                        title={collapsed ? item.label : undefined}
                        className="plain"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          justifyContent: collapsed ? "center" : "flex-start",
                          textAlign: "left",
                          padding: collapsed ? "9px 0" : "8px 14px",
                          borderLeft: active && !collapsed ? "2px solid var(--accent)" : "2px solid transparent",
                          background: active ? "var(--accent-soft)" : "transparent",
                          color: active ? "var(--accent-strong)" : "var(--text-muted)",
                          fontWeight: active ? 600 : 400,
                          fontSize: 13,
                          borderRadius: collapsed ? 0 : 6,
                          marginTop: 1,
                        }}
                      >
                        <span style={{ display: "flex", flexShrink: 0 }}>
                          <NavIcon id={item.id} />
                        </span>
                        {!collapsed && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "14px 32px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          {activeLabel}
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: "28px 32px", maxWidth: 1160, width: "100%" }}>{children}</main>
      </div>
    </div>
  );
}
