"use client";

import { useEffect, useState, type ReactNode } from "react";

import { NavIcon } from "./nav-icons";

type ThemeMode = "dark" | "light";

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

  // A single shared value, not per-browser localStorage — the owner
  // wants the toggle to look the same for every operator on every
  // device, so it's read/written through the DB (DashboardThemeService)
  // instead of a personal client-side preference.
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    fetch("/api/dashboard-theme")
      .then((r) => r.json())
      .then((d) => setTheme(d.mode === "light" ? "light" : "dark"));
  }, []);

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    fetch("/api/dashboard-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
  }

  const activeGroup = groups.find((g) => g.items.some((i) => i.id === activeTab));
  const activeLabel = activeGroup?.items.find((i) => i.id === activeTab)?.label ?? "";

  function toggleGroup(i: number) {
    setCollapsedGroups((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  return (
    <div className="app-shell" data-theme={theme} style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: collapsed ? 64 : 244,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          padding: "16px 0 18px",
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
            padding: collapsed ? "0 0 18px" : "0 14px 18px",
            marginBottom: 8,
            borderBottom: "1px solid var(--border)",
            gap: 8,
          }}
        >
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: 8,
                  background: "linear-gradient(155deg, var(--accent), var(--accent-strong))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 3px 10px -2px rgba(139, 124, 246, 0.5)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#08111f">
                  <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19.35 8 12 11.82 4.65 8 12 4.18zM4 9.04l7 3.5V19.5l-7-3.5V9.04zm9 10.46v-6.96l7-3.5v6.96l-7 3.5z" />
                </svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.2, minWidth: 0 }}>
                {sidebarLabel}
              </div>
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
              <div key={i} style={{ marginBottom: 10 }}>
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
                          padding: collapsed ? "10px 0" : "9px 14px",
                          border: "none",
                          background: active ? "var(--accent-soft)" : "transparent",
                          color: active ? "var(--accent-strong)" : "var(--text-muted)",
                          fontWeight: active ? 600 : 400,
                          fontSize: 13,
                          borderRadius: collapsed ? 8 : 999,
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
            padding: "16px 32px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            {activeGroup?.label && (
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 2 }}>
                {activeGroup.label}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--text)" }}>{activeLabel}</div>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="plain"
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: "28px 32px", maxWidth: 1160, width: "100%" }}>{children}</main>
      </div>
    </div>
  );
}
