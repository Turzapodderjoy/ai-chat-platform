/** Same shape as ai-manager's retryWithBackoff — duplicated rather than
 * imported to avoid embedding-manager depending on ai-manager for one
 * small helper. */
export async function retryOn429<T>(
  operation: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const is429 = error instanceof Error && error.message.includes("429");
      if (!is429 || attempt === attempts - 1) {
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** attempt)
      );
    }
  }

  throw lastError;
}
