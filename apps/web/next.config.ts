import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-chat-platform/ai-manager",
    "@ai-chat-platform/chunker",
    "@ai-chat-platform/database",
    "@ai-chat-platform/document-loader",
    "@ai-chat-platform/embedding-manager",
    "@ai-chat-platform/groq",
    "@ai-chat-platform/gemini",
    "@ai-chat-platform/openrouter",
    "@ai-chat-platform/cerebras",
    "@ai-chat-platform/mistral",
    "@ai-chat-platform/ingestion",
    "@ai-chat-platform/types",
    "@ai-chat-platform/vector-store",
    "@ai-chat-platform/indexing",
    "@ai-chat-platform/bootstrap",
    "@ai-chat-platform/api",
    "@ai-chat-platform/rag",
    "@ai-chat-platform/chat-service",
    "@ai-chat-platform/conversation",
    "@ai-chat-platform/retriever",
    "@ai-chat-platform/prompt-engine",
    "@ai-chat-platform/upload",
    "@ai-chat-platform/provider-catalog",
    "@ai-chat-platform/embedding-catalog",
    "@ai-chat-platform/tenant",
    "@ai-chat-platform/web-crawler",
    "@ai-chat-platform/ai-config",
    "@ai-chat-platform/provider-keys",
    "@ai-chat-platform/training-pipeline",
    "@ai-chat-platform/channel-catalog",
    "@ai-chat-platform/channel-connections",
  ],
};

export default nextConfig;