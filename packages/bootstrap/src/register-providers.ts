import { AIManager } from "@ai-chat-platform/ai-manager";
import { GroqProvider } from "@ai-chat-platform/groq";

export function registerProviders(
  manager: AIManager
) {
  manager.registerProvider(
    new GroqProvider(),
    [
      {
        id: "groq-key-1",
        value: process.env.GROQ_API_KEY ?? "",
      },

      // {
      //   id: "groq-key-2",
      //   value: process.env.GROQ_API_KEY_2 ?? "",
      // }
    ]
  );
}