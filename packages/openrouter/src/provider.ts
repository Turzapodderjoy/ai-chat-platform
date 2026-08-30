import { DEFAULT_MODEL, VISION_MODEL } from "./models";
import type { AIProvider, AIRequest, AIResponse } from "@ai-chat-platform/types";
import { InvalidApiKeyError, RateLimitedError } from "@ai-chat-platform/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

async function fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
  try {
    const dataUriMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      const mimeType = dataUriMatch[1]!;
      const base64 = dataUriMatch[2]!;
      if (Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES) return null;
      return `data:${mimeType};base64,${base64}`;
    }

    const res = await fetch(imageUrl);
    if (!res.ok) return null;

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";

  async generate(request: AIRequest, apiKey?: string): Promise<AIResponse> {
    if (!apiKey) {
      return {
        success: false,
        provider: this.name,
        message: "",
        error: "No API key provided",
      };
    }

    // Build user message content — multimodal when imageUrl is present
    let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

    if (request.imageUrl) {
      const dataUri = await fetchImageAsDataUri(request.imageUrl);
      if (dataUri) {
        userContent = [
          { type: "image_url", image_url: { url: dataUri } },
          { type: "text", text: request.message },
        ];
      } else {
        // Image fetch failed — fall back to text only
        userContent = request.message;
      }
    } else {
      userContent = request.message;
    }

    // Use vision model when image is present, default model otherwise
    const model = request.imageUrl ? VISION_MODEL : DEFAULT_MODEL;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system", content: request.systemPrompt }]
            : []),
          { role: "user", content: userContent },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = `OpenRouter request failed (${res.status}): ${body}`;

      if (res.status === 401 || res.status === 403) {
        throw new InvalidApiKeyError(message);
      }

      if (res.status === 429) {
        throw new RateLimitedError(message);
      }

      throw new Error(message);
    }

    const data = (await res.json()) as OpenRouterResponse;

    return {
      success: true,
      provider: this.name,
      message: data.choices?.[0]?.message?.content ?? "",
      tokens: data.usage?.total_tokens ?? 0,
    };
  }

  async health(): Promise<boolean> {
    return true;
  }
}
