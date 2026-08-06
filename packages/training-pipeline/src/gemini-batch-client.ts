import { GoogleGenAI } from "@google/genai";

// Own dedicated key (GEMINI_TRAINING_API_KEY), not the shared AIManager/
// Gemini key powering live chat — same reasoning as the old
// GROQ_TRAINING_API_KEY: a manually-triggered, occasional batch-analysis
// call must never compete with real customer traffic for quota, and vice
// versa a slow/rate-limited training run shouldn't be affected by live
// chat volume either.
const MODEL = "gemini-flash-latest";

export class GeminiBatchClient {
  constructor(private readonly apiKey: string) {}

  async analyze(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_TRAINING_API_KEY is not set — required to run batch analysis. Add it to your environment and redeploy."
      );
    }

    const client = new GoogleGenAI({ apiKey: this.apiKey });

    const response = await client.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    });

    return response.text ?? "";
  }
}
