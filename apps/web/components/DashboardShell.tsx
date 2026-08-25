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

const MOBILE_BREAKPOINT = 860;

/**
 * Shared sidebar + content layout for both dashboards. Sidebar is
 * collapsible (to an icon-only rail) and each labeled group collapses
 * independently — both purely local UI state, reset on reload, since
 * neither needs to persist across sessions for an internal tool. Below
 * MOBILE_BREAKPOINT the sidebar becomes an off-canvas drawer (a fixed
 * 244px column just doesn't work on a phone) opened by a hamburger
 * button that replaces the desktop collapse toggle. Every panel's own
 * markup/data-fetching is unchanged; this only changes what wraps
 * around it. Wrapped in `.app-shell` so the dashboard design tokens in
 * globals.css apply here and nowhere else.
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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // A single shared value, not per-browser localStorage — the owner
  // wants the toggle to look the same for every operator on every
  // device, so it's read/written through the DB (DashboardThemeService)
  // instead of a personal client-side preference.
  const [theme, setTheme] = useState<ThemeMode>("light");

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

  const railCollapsed = isMobile ? false : collapsed;
  const sidebarOpen = isMobile ? mobileOpen : true;

  return (
    <div className="app-shell" data-theme={theme} style={{ display: "flex", minHeight: "100vh" }}>
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
        />
      )}

      <aside
        style={{
          width: railCollapsed ? 64 : 244,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          padding: "16px 0 18px",
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          left: 0,
          alignSelf: "flex-start",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          zIndex: 50,
          transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
          transition: "width 0.15s ease, transform 0.2s ease",
          boxShadow: isMobile && sidebarOpen ? "0 0 40px rgba(0,0,0,0.35)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: railCollapsed ? "center" : "space-between",
            padding: railCollapsed ? "0 0 18px" : "0 14px 18px",
            marginBottom: 8,
            borderBottom: "1px solid var(--border)",
            gap: 8,
          }}
        >
          {!railCollapsed && (
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
                  boxShadow: "0 3px 10px -2px rgba(255, 122, 89, 0.45)",
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
            onClick={() => (isMobile ? setMobileOpen(false) : setCollapsed((c) => !c))}
            title={isMobile ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              {isMobile ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : collapsed ? (
                <path d="m9 5 7 7-7 7" />
              ) : (
                <path d="m15 5-7 7 7 7" />
              )}
            </svg>
          </button>
        </div>

        <nav>
          {groups.map((group, i) => {
            const groupCollapsed = collapsedGroups[i];
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                {group.label && !railCollapsed && (
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
                        onClick={() => {
                          onSelect(item.id);
                          if (isMobile) setMobileOpen(false);
                        }}
                        title={railCollapsed ? item.label : undefined}
                        className="plain"
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          justifyContent: railCollapsed ? "center" : "flex-start",
                          textAlign: "left",
                          padding: railCollapsed ? "10px 0" : "9px 14px 9px 18px",
                          border: "none",
                          background: active ? "var(--accent-soft)" : "transparent",
                          color: active ? "var(--accent-strong)" : "var(--text-muted)",
                          fontWeight: active ? 600 : 400,
                          fontSize: 13,
                          borderRadius: railCollapsed ? 8 : 999,
                          marginTop: 1,
                        }}
                      >
                        {/* A small glowing dot, not just a soft fill — the
                         * fill alone reads as "selected form control"
                         * (generic), a dot + fill together reads as a
                         * live/active status the way an ops tool marks
                         * "this is the thing running right now". */}
                        {active && !railCollapsed && (
                          <span
                            style={{
                              position: "absolute",
                              left: 6,
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: "var(--accent)",
                              boxShadow: "0 0 6px var(--accent)",
                            }}
                          />
                        )}
                        <span style={{ display: "flex", flexShrink: 0 }}>
                          <NavIcon id={item.id} />
                        </span>
                        {!railCollapsed && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
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
            padding: isMobile ? "14px 16px" : "16px 32px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="plain"
                title="Open menu"
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              {activeGroup?.label && (
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)", marginBottom: 2 }}>
                  {activeGroup.label}
                </div>
              )}
              <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeLabel}
              </div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="plain"
            style={{
              width: 30,
              height: 30,
              flexShrink: 0,
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
        <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "18px 16px" : "28px 32px", maxWidth: 1160, width: "100%" }}>{children}</main>
      </div>
    </div>
  );
}
