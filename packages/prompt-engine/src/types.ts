export interface PromptInput {
  systemPrompt: string;
  context: string[];
  userMessage: string;
}

export interface PromptOutput {
  prompt: string;
}