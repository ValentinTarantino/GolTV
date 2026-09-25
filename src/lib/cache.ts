const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();
const memoryLocks = new Map<string, number>();

export async function getCache<T>(key: string): Promise<T | null> {
  const entry = memoryCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data as T;
  }
  if (entry) memoryCache.delete(key);
  return null;
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function deleteCache(key: string): Promise<void> {
  memoryCache.delete(key);
}

export async function acquireLock(key: string, ttlMs: number): Promise<boolean> {
  const expiresAt = Date.now() + ttlMs;
  const existing = memoryLocks.get(key);
  if (existing && Date.now() < existing) return false;
  memoryLocks.set(key, expiresAt);
  return true;
}

export async function releaseLock(key: string): Promise<void> {
  memoryLocks.delete(key);
}

export async function incrementCounter(key: string, windowMs: number): Promise<number> {
  const current = await getCache<number>(`counter:${key}`);
  const count = (current ?? 0) + 1;
  await setCache(`counter:${key}`, count, windowMs);
  return count;
}

export function getMemoryCacheStats() {
  return {
    entries: memoryCache.size,
    locks: memoryLocks.size,
  };
}