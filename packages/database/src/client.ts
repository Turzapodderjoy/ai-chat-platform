import { PrismaClient, Prisma } from "@prisma/client";

export { Prisma };

const globalForPrisma =
  globalThis as unknown as {
    prisma?: PrismaClient;
  };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** CockroachDB is SERIALIZABLE-only and can abort a contended transaction
 * with a retryable write-conflict error (Prisma surfaces this as P2034) —
 * Postgres never did this, so callers written against Postgres semantics
 * need this wrapper around any transaction that could contend with
 * concurrent writes. Retries with a short backoff; rethrows anything else
 * or if retries are exhausted. */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!isRetryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
  throw new Error("unreachable");
}