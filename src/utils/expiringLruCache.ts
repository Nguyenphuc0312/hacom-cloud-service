interface ExpiringLruCacheOptions {
  maxEntries: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

export class ExpiringLruCache<T> {
  private readonly maxEntries: number;

  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: ExpiringLruCacheOptions) {
    this.maxEntries = Math.max(1, options.maxEntries);
  }

  get(key: string, skewMs = 0): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAtMs - Date.now() <= skewMs) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, expiresAtMs: number): void {
    if (!key) return;

    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, { value, expiresAtMs });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }
}

export default ExpiringLruCache;
