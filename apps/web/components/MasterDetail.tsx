"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

/**
 * MasterDetail — the one side-panel workflow every tile shares.
 *
 * Replaces the old "panel draws its own inner navigation" pattern, which put a
 * second app-level nav inside the shell that already had one. Modeled on the
 * Intercom inbox: a single list pane, a fluid detail canvas, and an optional
 * collapsible context panel. Views/filters belong at the top of the list pane,
 * never in their own column.
 *
 * Layout:      [list] [detail] [context?]
 * Collapsed:   [        detail        ] [context?]
 * Narrow:      list  ->  detail        (drill-down, `onBack` returns to list)
 *
 * Keyboard (matching Intercom): `[` cycles the list pane, `]` toggles context.
 */

export type ListWidth = "narrow" | "default" | "wide";

const LIST_WIDTHS: Record<ListWidth, number> = {
  narrow: 264,
  default: 320,
  wide: 400,
};

const ROOT: CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};

const LIST: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  minWidth: 0,
  background: "var(--panel)",
  borderRight: "1px solid var(--line)",
};

const DETAIL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  background: "var(--canvas)",
  position: "relative",
};

const CONTEXT: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  width: 300,
  minWidth: 0,
  background: "var(--panel)",
  borderLeft: "1px solid var(--line)",
};

export interface MasterDetailProps {
  /** The single side panel. Its own header should carry title + filters. */
  list: ReactNode;
  /** Main canvas. */
  detail: ReactNode;
  /** Optional third panel — collapsed by default on narrow viewports. */
  context?: ReactNode;
  listLabel?: string;
  contextLabel?: string;
  listWidth?: ListWidth;
  /** Drives the narrow-viewport drill-down: true = show detail, false = show list. */
  hasSelection?: boolean;
  /** Rendered in the detail canvas when nothing is selected. */
  emptyDetail?: ReactNode;
  /** Called when the narrow-viewport back affordance is used. */
  onBack?: () => void;
  /** Hide the list-collapse control (e.g. when a filter drawer owns it). */
  hideListToggle?: boolean;
  defaultListCollapsed?: boolean;
  defaultContextOpen?: boolean;
  /** Controlled value for the context panel. */
  contextOpen?: boolean;
  onContextOpenChange?: (open: boolean) => void;
  /** Controlled value for the list pane. */
  listCollapsed?: boolean;
  onListCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  style?: CSSProperties;
  rootRef?: RefObject<HTMLDivElement | null>;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

export function MasterDetail({
  list,
  detail,
  context,
  listLabel = "List",
  contextLabel = "Details",
  listWidth = "default",
  hasSelection = false,
  emptyDetail,
  onBack,
  hideListToggle = false,
  defaultListCollapsed = false,
  defaultContextOpen = false,
  contextOpen: contextOpenProp,
  onContextOpenChange,
  listCollapsed: listCollapsedProp,
  onListCollapsedChange,
  className,
  style,
  rootRef,
}: MasterDetailProps) {
  const isNarrow = useMediaQuery("(max-width: 900px)");

  const [listCollapsedState, setListCollapsedState] = useState(defaultListCollapsed);
  const [contextOpenState, setContextOpenState] = useState(defaultContextOpen);

  const listCollapsed = listCollapsedProp ?? listCollapsedState;
  const contextOpen = contextOpenProp ?? contextOpenState;

  const setList = useCallback(
    (v: boolean) => {
      if (listCollapsedProp !== undefined) onListCollapsedChange?.(v);
      else setListCollapsedState(v);
    },
    [listCollapsedProp, onListCollapsedChange],
  );
  const setContext = useCallback(
    (v: boolean) => {
      if (contextOpenProp !== undefined) onContextOpenChange?.(v);
      else setContextOpenState(v);
    },
    [contextOpenProp, onContextOpenChange],
  );

  // A narrow viewport only has room for one pane at a time.
  const listVisible = isNarrow ? !hasSelection : !listCollapsed;
  const detailVisible = isNarrow ? Boolean(hasSelection) : true;
  const showContext = Boolean(context) && (!isNarrow) && contextOpen;

  const toggleList = useCallback(() => setList(!listCollapsed), [setList, listCollapsed]);
  const toggleContext = useCallback(() => setContext(!contextOpen), [setContext, contextOpen]);

  // Intercom's `[` and `]` shortcuts. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "[" && !isNarrow) {
        e.preventDefault();
        toggleList();
      } else if (e.key === "]" && context) {
        e.preventDefault();
        toggleContext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNarrow, context, toggleList, toggleContext]);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ ...ROOT, ...style }}
      data-md-list={listVisible ? "open" : "collapsed"}
      data-md-detail={detailVisible ? "open" : "hidden"}
      data-md-context={showContext ? "open" : "closed"}
    >
      {listVisible && (
        <div style={{ ...LIST, width: LIST_WIDTHS[listWidth] }} aria-label={listLabel}>
          {list}
        </div>
      )}

      {detailVisible && (
        <div style={DETAIL}>
          {isNarrow && hasSelection && onBack && (
            <button
              type="button"
              className="plain"
              onClick={onBack}
              data-md-back="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                padding: "8px 10px",
                color: "var(--ink-2)",
                fontSize: 13,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {listLabel}
            </button>
          )}

          {hasSelection || !emptyDetail ? detail : emptyDetail}
        </div>
      )}

      {showContext && (
        <div style={CONTEXT} aria-label={contextLabel}>
          {context}
        </div>
      )}
    </div>
  );
}

/** Header row shared by the list pane — title, count, and filter controls. */
export function PaneHeader({
  title,
  count,
  children,
  style,
}: {
  title: ReactNode;
  count?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderBottom: "1px solid var(--line-soft)",
        background: "var(--panel)",
        ...style,
      }}
    >
      <span className="instrument-label" style={{ color: "var(--ink-2)" }}>
        {title}
      </span>
      {count !== undefined && (
        <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {count}
        </span>
      )}
      {children && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>{children}</span>}
    </div>
  );
}

/**
 * Segmented view switcher — Intercom puts conversation state filters at the top
 * of the list rather than in a separate column.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        background: "var(--panel-sunk)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)",
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            title={o.label}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 24,
              padding: "3px 6px",
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ink)" : "var(--ink-3)",
              background: active ? "var(--panel)" : "transparent",
              border: "1px solid " + (active ? "var(--line-strong)" : "transparent"),
              borderRadius: "var(--r-xs)",
              boxShadow: active ? "var(--edge-light)" : "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
            {o.count !== undefined && o.count > 0 && (
              <span className="data" style={{ fontSize: 10.5, color: active ? "var(--accent)" : "var(--ink-4)" }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
