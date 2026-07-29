// One-time-ish diagnostic: empirically find each embedding provider's real
// 429 ceiling instead of guessing constants. Hits the raw HTTP endpoints
// directly (not through JinaProvider/MistralEmbeddingProvider, which already
// wrap calls in retryOn429 — that would mask genuine 429s as silent retries
// and defeat the point of this benchmark). Run manually against real keys:
//
//   pnpm --filter @ai-chat-platform/embedding-manager exec tsx src/scripts/benchmark-rate-limits.ts
//
// Not wired into CI or any pipeline — costs real API calls against live
// keys, and provider limits don't change often enough to justify running
// this on every build.
const FILLER_TEXT =
  "The quick brown fox jumps over the lazy dog near the riverbank at dusk.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProbeResult {
  requestIndex: number;
  delayMs: number;
  status: number | "network-error";
}

async function probeJina(apiKey: string): Promise<number> {
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [FILLER_TEXT],
    }),
  });
  return res.status;
}

async function probeMistral(apiKey: string): Promise<number> {
  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-embed",
      input: [FILLER_TEXT],
    }),
  });
  return res.status;
}

/** The real trigger for the reported 429s was REQUEST FREQUENCY (many
 * rapid unpaced single-item calls in IndexingService.backfill()'s old
 * loop), not payload size — an earlier version of this script escalated
 * batch size at a fixed 1 req/sec and never got near a 429 (just hit
 * Mistral's payload-size cap instead, a 400, at batchSize=345). This
 * version fires N single-item requests back-to-back at a shrinking delay,
 * which is what actually reproduces a rate-limit burst. Stops once 429 is
 * hit twice in a row at a given delay (avoids treating one flaky 429 as
 * the real ceiling); returns the smallest delay that ran a full burst
 * clean. */
async function findCeiling(
  label: string,
  probe: () => Promise<number>,
  delaysToTry: number[],
  burstSize: number
): Promise<{ safeDelayMs: number; log: ProbeResult[] }> {
  const log: ProbeResult[] = [];
  let safeDelayMs = delaysToTry[0]!;

  for (const delayMs of delaysToTry) {
    let consecutive429s = 0;
    let cleanBurst = true;

    for (let i = 0; i < burstSize; i++) {
      if (i > 0) {
        await sleep(delayMs);
      }

      let status: number | "network-error";
      try {
        status = await probe();
      } catch {
        status = "network-error";
      }

      log.push({ requestIndex: i, delayMs, status });
      console.log(`  [${label}] delayMs=${delayMs} req#${i} -> ${status}`);

      if (status === 429) {
        consecutive429s += 1;
        cleanBurst = false;
        if (consecutive429s >= 2) break;
      } else {
        consecutive429s = 0;
      }
    }

    if (cleanBurst) {
      safeDelayMs = delayMs;
      break; // fastest clean delay found — no need to test slower ones
    }
  }

  return { safeDelayMs, log };
}

async function main() {
  const jinaKey = process.env.JINA_API_KEY;
  const mistralKey = process.env.MISTRAL_EMBEDDING_API_KEY;

  // Fast to slow — findCeiling stops at the first clean one, which is the
  // fastest safe rate. burstSize=60 mirrors the actual bug scenario
  // (IndexingService.backfill()'s old loop firing hundreds of unpaced
  // sequential single-item calls) closer than a short 15-request probe —
  // 50/100ms bursts of only 15 requests never tripped a 429 at all.
  const DELAYS_TO_TRY_MS = [0, 20, 50, 100, 250];
  const BURST_SIZE = 60;
  const SAFETY_MARGIN = 1.3; // recommend 30% slower than the observed-clean delay

  const results: Record<string, { observedSafeDelayMs: number; recommendedDelayMs: number; recommendedBatchSize: number }> = {};

  if (jinaKey) {
    console.log("Benchmarking Jina...");
    const { safeDelayMs } = await findCeiling("jina", () => probeJina(jinaKey), DELAYS_TO_TRY_MS, BURST_SIZE);
    results.jina = {
      observedSafeDelayMs: safeDelayMs,
      recommendedDelayMs: Math.ceil(safeDelayMs * SAFETY_MARGIN),
      recommendedBatchSize: 20,
    };
  } else {
    console.log("Skipping Jina — JINA_API_KEY not set.");
  }

  if (mistralKey) {
    console.log("Benchmarking Mistral...");
    const { safeDelayMs } = await findCeiling("mistral", () => probeMistral(mistralKey), DELAYS_TO_TRY_MS, BURST_SIZE);
    results.mistral = {
      observedSafeDelayMs: safeDelayMs,
      recommendedDelayMs: Math.ceil(safeDelayMs * SAFETY_MARGIN),
      recommendedBatchSize: 20,
    };
  } else {
    console.log("Skipping Mistral — MISTRAL_EMBEDDING_API_KEY not set.");
  }

  console.log("\n=== Results (fill these into PROVIDER_BATCH_CONFIG) ===");
  console.log(JSON.stringify(results, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
