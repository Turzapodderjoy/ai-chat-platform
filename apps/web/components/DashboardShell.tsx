"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavIcon } from "./nav-icons";

type ThemeMode = "dark" | "light";

export interface NavItem<T extends string> {
  id: T;
  label: string;
}

export interface NavGroup<T extends string> {
  label?: string;
  items: NavItem<T>[];
}

const MOBILE_BREAKPOINT = 860;

export function DashboardShell<T extends string>({
  sidebarLabel,
  groups,
  activeTab,
  onSelect,
  username,
  onLogout,
  backHref,
  topbarExtra,
  children,
}: {
  sidebarLabel: ReactNode;
  groups: NavGroup<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
  username?: string | null;
  onLogout?: () => void;
  backHref?: string;
  /** Rendered in the topbar, right before the theme toggle -- e.g. a
   * business-scoped notification bell. Omit where there's no single
   * business in scope (the mother dashboard). */
  topbarExtra?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const profileBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (profileBoxRef.current && !profileBoxRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const flat = groups.flatMap((g) => g.items.map((item) => ({ item, groupLabel: g.label })));
    return flat.filter((f) => f.item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [groups, search]);

  function jumpTo(id: T) {
    onSelect(id);
    setSearch("");
    setSearchOpen(false);
  }

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

  const railCollapsed = isMobile ? false : collapsed;
  const sidebarOpen = isMobile ? mobileOpen : true;

  return (
    <div className="app-shell" data-theme={theme} style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, backdropFilter: "blur(4px)" }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: railCollapsed ? 72 : 260,
          flexShrink: 0,
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          zIndex: 50,
          transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
          transition: "width 0.2s var(--ease-out), transform 0.3s var(--ease-out)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: railCollapsed ? "20px 0" : "20px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: railCollapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {!railCollapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="white" fillOpacity="0.2"/>
                  <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {sidebarLabel}
                </div>
              </div>
            </div>
          )}
          {railCollapsed && (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-sm)",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="white" fillOpacity="0.2"/>
                <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          {!railCollapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="ghost"
              title="Collapse sidebar"
              style={{ width: 28, height: 28, padding: 0, borderRadius: "var(--radius-xs)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          {railCollapsed && (
            <div style={{ padding: "0 8px 12px", borderTop: "1px solid var(--border-subtle)", marginTop: "auto" }}>
              <button
                onClick={() => setCollapsed(false)}
                className="ghost"
                title="Expand sidebar"
                style={{ 
                  width: "100%", 
                  height: 36, 
                  padding: 0, 
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {groups.map((group, i) => {
            const groupCollapsed = collapsedGroups[i];
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                {group.label && !railCollapsed && (
                  <button
                    onClick={() => toggleGroup(i)}
                    className="ghost"
                    style={{
                      width: "100%",
                      justifyContent: "space-between",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-muted)",
                      padding: "8px 12px",
                      marginBottom: 2,
                    }}
                  >
                    <span>{group.label}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      style={{ transform: groupCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }}
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
                        className="ghost"
                        style={{
                          width: "100%",
                          justifyContent: railCollapsed ? "center" : "flex-start",
                          textAlign: "left",
                          padding: railCollapsed ? "10px" : "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          marginBottom: 2,
                          background: active ? "var(--accent-subtle)" : "transparent",
                          color: active ? "var(--accent)" : "var(--text-secondary)",
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        <span style={{ display: "flex", flexShrink: 0 }}>
                          <NavIcon id={item.id} />
                        </span>
                        {!railCollapsed && (
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <header
          style={{
            padding: isMobile ? "12px 16px" : "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="ghost"
                title="Open menu"
                style={{ width: 36, height: 36, padding: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              </button>
            )}
            <div>
              {activeGroup?.label && (
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 2 }}>
                  {activeGroup.label}
                </div>
              )}
              <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
                {activeLabel}
              </h1>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Search */}
            {!isMobile && (
              <div ref={searchBoxRef} style={{ position: "relative" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, pointerEvents: "none" }}>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search..."
                    style={{
                      width: 200,
                      padding: "8px 12px 8px 36px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontSize: 13,
                    }}
                  />
                  <kbd style={{
                    position: "absolute",
                    right: 8,
                    fontSize: 10,
                    color: "var(--text-muted)",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "2px 6px",
                    pointerEvents: "none",
                  }}>
                    ⌘K
                  </kbd>
                </div>
                {searchOpen && search.trim() && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-lg)",
                    overflow: "hidden",
                    zIndex: 60,
                    minWidth: 240,
                  }}>
                    {searchResults.length === 0 && (
                      <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>No results found</div>
                    )}
                    {searchResults.map(({ item, groupLabel }) => (
                      <button
                        key={item.id}
                        onClick={() => jumpTo(item.id)}
                        className="ghost"
                        style={{
                          width: "100%",
                          justifyContent: "flex-start",
                          padding: "10px 14px",
                          borderRadius: 0,
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <span style={{ display: "flex", flexShrink: 0, color: "var(--text-muted)" }}>
                          <NavIcon id={item.id} />
                        </span>
                        <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                        {groupLabel && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{groupLabel}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {topbarExtra}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="ghost"
              style={{ width: 36, height: 36, padding: 0, borderRadius: "var(--radius-sm)" }}
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Profile */}
            {(username || onLogout) && (
              <div ref={profileBoxRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  className="ghost"
                  title={username ?? "Account"}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {(username ?? "?").slice(0, 1).toUpperCase()}
                </button>
                {profileOpen && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: 200,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-lg)",
                    overflow: "hidden",
                    zIndex: 60,
                  }}>
                    {username && (
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{username}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Admin</div>
                      </div>
                    )}
                    {backHref && (
                      <a
                        href={backHref}
                        style={{ display: "block", padding: "10px 16px", fontSize: 13, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        Back to Command Center
                      </a>
                    )}
                    {onLogout && (
                      <button
                        onClick={onLogout}
                        className="ghost"
                        style={{ width: "100%", justifyContent: "flex-start", padding: "10px 16px", borderRadius: 0, color: "var(--danger)" }}
                      >
                        Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="panel-scroll" style={{ flex: 1, padding: isMobile ? "16px" : "24px", maxWidth: 1400, width: "100%", margin: "0 auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
