const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_KEYS = 1000;

export const buildRealtimeEventKey = (parts: {
  eventId?: string | null;
  eventName: string;
  conversationId?: string | null;
  entityId?: string | null;
  version?: string | number | null;
}): string => {
  if (parts.eventId?.trim()) {
    return parts.eventId.trim();
  }

  return [
    parts.eventName,
    parts.conversationId || "global",
    parts.entityId || "unknown",
    parts.version ?? "latest",
  ].join(":");
};

export const createRealtimeEventDeduper = (
  options: {
    ttlMs?: number;
    maxKeys?: number;
    now?: () => number;
  } = {},
) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = options.now ?? (() => Date.now());
  const seen = new Map<string, number>();

  const prune = (timestamp: number) => {
    seen.forEach((seenAt, key) => {
      if (timestamp - seenAt > ttlMs) {
        seen.delete(key);
      }
    });

    while (seen.size > maxKeys) {
      const oldestKey = seen.keys().next().value;
      if (typeof oldestKey !== "string") {
        break;
      }
      seen.delete(oldestKey);
    }
  };

  return {
    shouldProcess(eventKey: string): boolean {
      if (!eventKey) return true;

      const timestamp = now();
      prune(timestamp);

      if (seen.has(eventKey)) {
        return false;
      }

      seen.set(eventKey, timestamp);
      prune(timestamp);
      return true;
    },

    clear() {
      seen.clear();
    },

    get size() {
      return seen.size;
    },
  };
};
