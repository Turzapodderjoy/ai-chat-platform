import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-chat-platform/ai-manager",
    "@ai-chat-platform/config",
    "@ai-chat-platform/types",
    "@ai-chat-platform/gemini",
  ],
};

export default nextConfig;