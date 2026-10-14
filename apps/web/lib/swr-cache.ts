// Tiny stale-while-revalidate cache for expensive read-only snapshots
// (the ops monitor and the system map both run live probes / remediation
// and can take tens of seconds). Instead of making every dashboard poll
// block on that, we hand back the last good snapshot immediately and
// refresh in the background. Pass `fresh` when a human explicitly asked
// (opened the panel and clicked refresh) and you want to await the live
// value.
type Entry = { value: unknown | null; at: number };

const stores = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function swr<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  fresh = false,
): Promise<T | null> {
  let store = stores.get(key);
  if (!store) {
    store = { value: null, at: 0 };
    stores.set(key, store);
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  const age = Date.now() - store.at;
  const stale = store.value === null || age > ttlMs;

  function refresh(): Promise<T> {
    const p = loader()
      .then((v) => {
        store!.value = v;
        store!.at = Date.now();
        return v;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
    return p;
  }

  if (fresh) {
    if (running) return running;
    return refresh();
  }

  if (stale && !running) {
    // Kick the refresh loose but never make the caller wait for it.
    void refresh().catch(() => {});
  }

  return store.value as T | null;
}

export function peek<T>(key: string): T | null {
  const store = stores.get(key);
  return (store?.value as T | null) ?? null;
}
