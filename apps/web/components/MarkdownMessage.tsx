"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
 */
export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
