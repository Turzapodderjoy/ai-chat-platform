import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-chat-platform/ai-manager",
    "@ai-chat-platform/chat-engine",
    "@ai-chat-platform/chunker",
    "@ai-chat-platform/config",
    "@ai-chat-platform/database",
    "@ai-chat-platform/document-loader",
    "@ai-chat-platform/embedding-manager",
    "@ai-chat-platform/groq",
    "@ai-chat-platform/ingestion",
    "@ai-chat-platform/knowledge-base",
    "@ai-chat-platform/types",
    "@ai-chat-platform/vector-store",
    "@ai-chat-platform/vector-repository",
    "@ai-chat-platform/indexing",
  ],
  serverExternalPackages: ["@lancedb/lancedb"],
};

export default nextConfig;