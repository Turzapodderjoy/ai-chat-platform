"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavIcon } from "./nav-icons";
import { AppDialogHost } from "../lib/app-dialog";
import { MasterProfileSelector } from "./MasterProfileSelector";

type ThemeMode = "dark" | "light";

export interface NavItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

function formatBadgeCount(n: number): string {
  return n > 100 ? "100+" : String(n);
}

function ShellClock() {
  const [now, setNow] = useState<null | Date>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      suppressHydrationWarning
      style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, letterSpacing: "0.02em", color: "var(--ink-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
    >
      {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
    </span>
  );
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
  fillHeight,
  children,
  businessId,
  hideRail,
}: {
  sidebarLabel: ReactNode;
  groups: NavGroup<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
  username?: string | null;
  onLogout?: () => void;
  backHref?: string;
  topbarExtra?: ReactNode;
  fillHeight?: boolean;
  children: ReactNode;
  businessId?: string;
  hideRail?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [railOverride, setRailOverride] = useState(false);
  const railHidden = Boolean(hideRail) && !railOverride;
  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileBoxRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");

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

  // When the parent turns focus-rail mode (e.g. Inbox, a repair shop's
  // work panel) on or off, drop any manual override so the rail returns
  // to its automatic show/hide state.
  useEffect(() => {
    setRailOverride(false);
  }, [hideRail]);

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
      if (profileBoxRef.current && !profileBoxRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const localResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const flat = groups.flatMap((g) => g.items.map((item) => ({ item, groupLabel: g.label })));
    return flat.filter((f) => f.item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [groups, search]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 3 || !businessId) {
      setGlobalResults([]);
      return;
    }
    let cancelled = false;
    setGlobalLoading(true);
    fetch(`/api/admin/global-search?businessId=${businessId}&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setGlobalResults(data.results ?? []); })
      .catch(() => { if (!cancelled) setGlobalResults([]); })
      .finally(() => { if (!cancelled) setGlobalLoading(false); });
    return () => { cancelled = true; };
  }, [search, businessId]);

  useEffect(() => {
    fetch("/api/dashboard-theme")
      .then((r) => r.json())
      .then((d) => setTheme(d.mode === "dark" ? "dark" : "light"));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    fetch("/api/dashboard-theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: next }) });
  }

  function jumpTo(id: string) {
    onSelect(id as T);
    setSearch("");
    setSearchOpen(false);
    if (isMobile) setMobileOpen(false);
  }

  function toggleGroup(i: number) {
    setCollapsedGroups((prev) => ({ ...prev, i: !prev[i] }));
  }

  const railWidth = collapsed ? 72 : 236;
  const searchActive = searchOpen || search.trim().length > 0;

  const activeGroup = groups.find((g) => g.items.some((i) => i.id === activeTab));
  const activeLabel = activeGroup?.items.find((i) => i.id === activeTab)?.label ?? "";

  function collapseToggle() {
    if (!isMobile) setCollapsed((p) => !p);
    else setMobileOpen(false);
  }

  const sidebar = (
    <aside
      style={{
        width: isMobile ? 244 : railWidth,
        minWidth: 0,
        height: isMobile ? "100vh" : "100%",
        background: "var(--panel)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        transition: "width 180ms var(--ease-out)",
        overflow: "hidden",
        flexShrink: 0,
        zIndex: isMobile ? 50 : 10,
      }}
    >
      {/* Brand */}
      <div style={{ padding: collapsed ? "14px 16px" : "14px 18px", display: "flex", alignItems: "center", gap: 11, borderBottom: "1px solid var(--line)", minHeight: 48 }}>
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={() => {
            if (isMobile) setMobileOpen(false);
            else if (hideRail) setRailOverride(false);
            else setCollapsed((p) => !p);
          }}
          style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {!collapsed ? (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sidebarLabel}</div>
            {activeLabel ? <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</div> : null}
          </div>
        ) : null}
      </div>

      {/* Search */}
      <div style={{ padding: collapsed ? 12 : "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx={11} cy={11} r={7} />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder={collapsed ? "" : "Search"}
            value={search}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            style={{ width: "100%", height: 32, paddingLeft: 30, paddingRight: 10, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel-sunk)", color: "var(--ink)", fontSize: 12.5, outline: "none" }}
          />
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "8px 6px" : "10px 10px" }}>
        <nav aria-label="Primary">
          {groups.map((group, gi) => {
            const isCollapsed = collapsedGroups[gi] ?? group.label === undefined;
            return (
              <div key={gi} style={{ marginBottom: 6 }}>
                {group.label && !collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(gi)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "6px 6px 3px", border: 0, background: "transparent", color: "var(--ink-4)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}
                  >
                    <span>{group.label}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-4)", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 120ms var(--ease-out)" }}>▾</span>
                  </button>
                ) : null}
                {!isCollapsed ? group.items.map((item) => {
                  const active = item.id === activeTab;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => jumpTo(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        width: "100%",
                        padding: collapsed ? "8px" : "8px 10px 8px 8px",
                        margin: "2px 0",
                        justifyContent: collapsed ? "center" : "flex-start",
                        border: 0,
                        borderRadius: "var(--r-sm)",
                        background: active ? "var(--accent-subtle)" : "transparent",
                        color: active ? "var(--accent)" : "var(--ink-2)",
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        textAlign: "left",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 120ms var(--ease-out), color 120ms var(--ease-out)",
                      }}
                      aria-current={active ? "page" : undefined}
                    >
                      {active ? <span style={{ position: "absolute", left: 3, top: 8, bottom: 8, width: 2, background: "var(--accent)" }} /> : null}
                      <NavIcon id={String(item.id)} />
                      {!collapsed ? <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span> : null}
                      {item.badge && !collapsed ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums", background: "var(--danger-subtle)", padding: "1px 6px", borderRadius: 3 }}>{formatBadgeCount(item.badge)}</span> : null}
                    </button>
                  );
                }) : null}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Search results popover */}
      {searchActive ? (
        <div
          style={{ position: "absolute", left: isMobile ? 12 : collapsed ? 10 : 12, right: isMobile ? 12 : "auto", top: collapsed ? 96 : 96, width: collapsed ? 240 : 320, zIndex: 60, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)", maxHeight: 320, overflow: "auto", padding: 6 }}
        >
          {localResults.length > 0 ? (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-4)", padding: "6px 10px 4px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Sections</div>
              {localResults.map(({ item }) => (
                <button key={item.id} type="button" onClick={() => jumpTo(item.id)} style={{ display: "flex", width: "100%", gap: 10, padding: "8px 10px", border: 0, borderRadius: "var(--r-sm)", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                  <NavIcon id={String(item.id)} width={15} height={15} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{item.label}</span>
                </button>
              ))}
            </>
          ) : (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--ink-3)" }}>No matching section.</div>
          )}
          {globalLoading || globalResults.length > 0 ? (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-4)", padding: "10px 10px 4px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Records</div>
              {globalLoading ? <div style={{ padding: "6px 14px 10px", fontSize: 12.5, color: "var(--ink-3)" }}>Searching…</div> : null}
              {!globalLoading && globalResults.length === 0 ? <div style={{ padding: "6px 14px 10px", fontSize: 12.5, color: "var(--ink-3)" }}>No matching records.</div> : null}
              {globalResults.map((r) => (
                <button key={r.id} type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} style={{ display: "flex", width: "100%", gap: 10, padding: "8px 10px", border: 0, borderRadius: "var(--r-sm)", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{r.title}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {/* Footer */}
      <div style={{ padding: collapsed ? 8 : "10px 14px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start", alignItems: "center", padding: "2px 0" }}>
          <MasterProfileSelector />
        </div>
        {topbarExtra ? <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start", alignItems: "center", padding: "2px 0" }}>{topbarExtra}</div> : null}
        <div ref={profileBoxRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setProfileOpen((p) => !p)}
            style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, border: 0, background: "transparent", cursor: "pointer", padding: collapsed ? 4 : 6, borderRadius: "var(--r-sm)", textAlign: "left" }}
          >
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-subtle)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>
              {(username ?? "—").charAt(0).toUpperCase()}
            </span>
            {!collapsed ? (
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{username ?? "Guest"}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: "var(--r-sm)", border: 0, background: "transparent", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {theme === "light" ? (
                <path d="M12 3v1.4M12 19.6V21M4.6 4.6l1 1M18.4 18.4l1 1M3 12h1.4M19.6 12H21M4.6 19.4l1-1M18.4 5.6l1-1M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              ) : (
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              )}
            </svg>
          </button>
          {profileOpen ? (
            <div ref={profileBoxRef} style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-pop)", padding: 6, zIndex: 70 }}>
              {backHref ? (
                <a
                  href={backHref}
                  style={{ display: "flex", width: "100%", padding: "8px 10px", border: 0, borderRadius: "var(--r-sm)", background: "transparent", fontSize: 13, fontWeight: 500, color: "var(--ink)", textDecoration: "none" }}
                >
                  Back to fleet
                </a>
              ) : null}
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  style={{ display: "flex", width: "100%", padding: "8px 10px", border: 0, borderRadius: "var(--r-sm)", background: "transparent", fontSize: 13, fontWeight: 500, color: "var(--danger)", cursor: "pointer", textAlign: "left" }}
                >
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!collapsed ? <div style={{ fontSize: 11.5, color: "var(--ink-4)", textAlign: "left", padding: "2px 6px 0" }}><ShellClock /></div> : null}
      </div>
    </aside>
  );

  return (
    <div className="app-shell" data-theme={theme} style={{ display: "flex", height: "100vh", overflow: "hidden", overflowX: "hidden" }}>
      {/* Mobile top bar */}
      {isMobile ? (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, background: "var(--panel)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", zIndex: 45, gap: 12 }}
        >
          <button type="button" onClick={() => setMobileOpen(true)} style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, justifyContent: "flex-start" }}>
            <MasterProfileSelector />
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</div>
          </div>
          {topbarExtra ? <div>{topbarExtra}</div> : null}
          <button type="button" onClick={toggleTheme} style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {theme === "light" ? <path d="M12 3v1.4M12 19.6V21M4.6 4.6l1 1M18.4 18.4l1 1M3 12h1.4M19.6 12H21M4.6 19.4l1-1M18.4 5.6l1-1M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /> : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />}
            </svg>
          </button>
        </div>
      ) : null}

      {/* Scrim */}
      {isMobile && mobileOpen ? <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,21,28,0.45)", zIndex: 40, backdropFilter: "blur(2px)" }} /> : null}

      {/* Sidebar (desktop / drawer). In focus mode (hideRail) the desktop
          rail is hidden so the focused work surface gets the full width;
          a floating handle brings it back on demand. Mobile keeps the
          drawer so navigation is never more than one tap away. */}
      {isMobile ? (mobileOpen ? (
        <div style={{ position: "fixed", top: 0, left: 0, zIndex: 50, height: "100vh" }}>
          {sidebar}
        </div>
      ) : null) : (!railHidden ? (
        <div style={{ position: "relative", top: 0, left: 0, zIndex: 10, height: "auto" }}>
          {sidebar}
        </div>
      ) : null)}

      {/* Floating rail handle: shown only when the desktop rail is
          auto-hidden, so a focus surface stays full-width but the
          operator can summon navigation without leaving the tab. */}
      {!isMobile && railHidden ? (
        <button
          type="button"
          aria-label="Show navigation"
          title="Show navigation"
          onClick={() => setRailOverride(true)}
          style={{ position: "fixed", top: 14, left: 14, zIndex: 46, display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink-2)", cursor: "pointer", boxShadow: "var(--shadow-pop)" }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      ) : null}

      {/* Work area */}
      <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <main
          className={fillHeight ? undefined : "panel-scroll"}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            // top padding leaves room for... none now; use 0
            padding: 0,
            maxWidth: "none",
            width: "100%",
            margin: 0,
            overflow: "hidden",
            ...(fillHeight ? {} : { overflowY: "auto" }),
          }}
        >
          {children}
        </main>
      </div>
      <AppDialogHost />
    </div>
  );
}
