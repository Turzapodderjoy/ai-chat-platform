"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CSSProperties } from "react";

/**
 * Renders a chat message's text as markdown — bullet/numbered lists and
 * GFM tables, which the AI Brain's default system prompt is explicitly
 * instructed to produce for multi-item answers. Without this, replies
 * like "- Product: X\n- Price: Y" or a markdown table render as literal
 * dashes/pipes instead of an actual list/table. Shared by every panel
 * that displays chat transcripts so formatting behaves identically across
 * the dashboard (the public embeddable widget has its own equivalent
 * renderer in apps/web/public/widget.js, since that file has no bundler
 * and can't import this).
 *
 * This is the machine layer's voice, so it reads like an instrument note:
 * one column of prose at a comfortable measure (68ch), token-coloured
 * quotes and code, cobalt links. The element-level rules for p/ul/ol/a/th
 * live in app/globals.css under `.markdown-message`; only the things CSS
 * can't express (the measure, the fenced-code block) are set here.
 */

// Prose measure. Long lines in a chat bubble are the single biggest
// readability problem in a transcript; 68ch is the classic comfortable
// column and it also stops a wide dashboard from stretching one line of
// AI prose across 1400px.
const measureStyle: CSSProperties = {
  maxWidth: "68ch",
  lineHeight: 1.55,
};

const codeBlockStyle: CSSProperties = {
  margin: "10px 0",
  padding: "11px 13px",
  overflowX: "auto",
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--ink)",
};

const inlineCodeStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.9em",
  background: "var(--panel-sunk)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-xs)",
  padding: "1px 5px",
  color: "var(--ink)",
};

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-message" style={measureStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // A fenced block is a readout, not a chip: strip the inline-code
          // chrome off the <code> react-markdown nests inside <pre>.
          pre: ({ children }) => <pre style={codeBlockStyle}>{children}</pre>,
          code: ({ children, className }) =>
            className ? (
              <code className={className} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {children}
              </code>
            ) : (
              <code style={inlineCodeStyle}>{children}</code>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
