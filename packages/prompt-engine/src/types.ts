export interface PromptHistoryTurn {
  role: string;
  content: string;
}

export interface PromptInput {
  systemPrompt: string;
  context: string[];
  history?: PromptHistoryTurn[];
  userMessage: string;
}

export interface PromptOutput {
  /** Sent via each provider's actual system role/systemInstruction, not
   * flattened into the user message — see AIRequest.systemPrompt. */
  systemPrompt: string;
  /** Knowledge base context + conversation history + the current
   * question — everything that changes per-request, as opposed to the
   * business's standing instructions in systemPrompt. */
  userPrompt: string;
}
