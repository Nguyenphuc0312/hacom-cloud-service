// Module-level cache: fileId -> blob ObjectURL created after a local image upload.
// It bridges the gap between optimistic preview and the backend thumbnail URL.
// Object URLs pin Blob memory, so this cache must be bounded even if thumbnail
// generation never emits preview_ready.
const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 32;

interface BlobPreviewEntry {
  objectUrl: string;
  createdAtMs: number;
  expiresAtMs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, BlobPreviewEntry>();

const revokeObjectUrl = (objectUrl: string): void => {
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Best effort only.
  }
};

const deleteEntry = (fileId: string): void => {
  const entry = cache.get(fileId);
  if (!entry) return;
  if (entry.timer) {
    clearTimeout(entry.timer);
  }
  revokeObjectUrl(entry.objectUrl);
  cache.delete(fileId);
};

const enforceEntryLimit = (): void => {
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    deleteEntry(oldestKey);
  }
};

export const blobPreviewCache = {
  set(fileId: string, objectUrl: string, ttlMs: number = DEFAULT_TTL_MS): void {
    this.delete(fileId);
    const now = Date.now();
    const safeTtlMs =
      Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
    const timer =
      typeof setTimeout === "function"
        ? setTimeout(() => {
            deleteEntry(fileId);
          }, safeTtlMs)
        : null;
    cache.set(fileId, {
      objectUrl,
      createdAtMs: now,
      expiresAtMs: now + safeTtlMs,
      timer,
    });
    enforceEntryLimit();
  },
  get(fileId: string): string | undefined {
    const entry = cache.get(fileId);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
      deleteEntry(fileId);
      return undefined;
    }
    cache.delete(fileId);
    cache.set(fileId, entry);
    return entry.objectUrl;
  },
  delete(fileId: string): void {
    deleteEntry(fileId);
  },
  clear(): void {
    Array.from(cache.keys()).forEach(deleteEntry);
  },
  size(): number {
    return cache.size;
  },
};
