import { DEFAULT_SYSTEM_PROMPT } from "./system-prompt";
import { PromptBuilder } from "./builder";

export class PromptEngine {
  private builder = new PromptBuilder();

  buildPrompt(
    context: string[],
    user: string
  ) {
    return this.builder.build(
      DEFAULT_SYSTEM_PROMPT,
      context,
      user
    );
  }
}