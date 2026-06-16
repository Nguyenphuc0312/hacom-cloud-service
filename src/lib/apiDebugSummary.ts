/**
 * @fileoverview Dev-only axios request summary.
 *
 * RTK Query traffic is already covered by `rtkQueryMetricsMiddleware`, but the
 * raw axios calls (profile fetches, batch-thumbnail-urls, download/preview URLs)
 * were invisible. When `VITE_API_DEBUG_REQUESTS=true`, this module aggregates
 * every axios request over a short window and prints a `console.table` grouped
 * by endpoint pattern so you can SEE the request-per-user-action count — the
 * core signal for spotting N+1 / request storms.
 *
 * Privacy: only method, URL path and status code are recorded. No headers, no
 * Authorization token, no response bodies.
 *
 * Disabled (zero overhead) unless the env flag is set.
 */

import { logger } from "../utils/logger";

const ENABLED =
  typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_API_DEBUG_REQUESTS === "true";

/** Window after the first request in which calls are aggregated, then flushed. */
const WINDOW_MS = 10_000;
const MAX_SAMPLE_IDS = 5;
/** GET /users/:id count in one window above which we flag a likely N+1. */
const USERS_BY_ID_WARN_THRESHOLD = 3;

interface PendingCall {
  endpoint: string;
  resourceKey: string;
  startedAt: number;
}

interface EndpointStat {
  count: number;
  durations: number[];
  status2xx: number;
  status4xx: number;
  status5xx: number;
  statusOther: number;
  /** raw path (incl. ids) -> times requested, for duplicate detection */
  resourceCounts: Map<string, number>;
}

const pending = new Map<string, PendingCall>();
let window: Map<string, EndpointStat> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Collapse ids so /users/<uuid> and /files/123 group under one pattern. */
const toEndpointPattern = (method: string, url: string): string => {
  const path = (url.split("?")[0] ?? url)
    .replace(UUID_RE, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${method.toUpperCase()} ${path}`;
};

const toResourceKey = (method: string, url: string): string =>
  `${method.toUpperCase()} ${url.split("?")[0] ?? url}`;

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, WINDOW_MS);
};

const flush = (): void => {
  flushTimer = null;
  const current = window;
  window = null;
  if (!current || current.size === 0) return;

  const rows = Array.from(current.entries())
    .map(([endpoint, stat]) => {
      const sorted = [...stat.durations].sort((a, b) => a - b);
      let duplicateResourceCount = 0;
      const sampleResourceIds: string[] = [];
      for (const [key, n] of stat.resourceCounts) {
        if (n > 1) duplicateResourceCount += n - 1;
        if (sampleResourceIds.length < MAX_SAMPLE_IDS) sampleResourceIds.push(key);
      }
      return {
        endpoint,
        count: stat.count,
        duplicateResourceCount,
        avgLatency: Math.round(
          sorted.reduce((sum, n) => sum + n, 0) / Math.max(1, sorted.length),
        ),
        p95Latency: Math.round(percentile(sorted, 95)),
        ["2xx"]: stat.status2xx,
        ["4xx"]: stat.status4xx,
        ["5xx"]: stat.status5xx,
        sampleResourceIds: sampleResourceIds.join(", "),
      };
    })
    .sort((a, b) => b.count - a.count);

  const table = typeof console !== "undefined" ? console.table : undefined;
  if (table) {
    console.groupCollapsed?.(
      `[API Request Summary] ${rows.reduce((s, r) => s + r.count, 0)} requests / ${WINDOW_MS / 1000}s window`,
    );
    table(rows);
    console.groupEnd?.();
  } else {
    logger.info("api-debug", "request_summary", { rows });
  }

  // Hygiene guard: a burst of GET /users/:id means a list-render N+1 slipped
  // back in (the canonical path is userBatchLoader -> POST /users/batch).
  const perIdRow = rows.find((r) => r.endpoint === "GET /users/:id");
  if (perIdRow && perIdRow.count >= USERS_BY_ID_WARN_THRESHOLD) {
    console.warn(
      `API Hygiene Warning: GET /users/:id called ${perIdRow.count}x during a ` +
        `${WINDOW_MS / 1000}s window. Use userBatchLoader (loadUserProfile/` +
        `loadUserProfiles) or summary fields, not per-item profile fetches.`,
    );
  }
};

export const isApiDebugEnabled = (): boolean => ENABLED;

export const recordRequestStart = (
  requestId: string,
  method: string | undefined,
  url: string | undefined,
): void => {
  if (!ENABLED || !requestId || !url) return;
  const safeMethod = method ?? "GET";
  pending.set(requestId, {
    endpoint: toEndpointPattern(safeMethod, url),
    resourceKey: toResourceKey(safeMethod, url),
    startedAt:
      typeof performance !== "undefined" ? performance.now() : Date.now(),
  });
};

export const recordRequestEnd = (
  requestId: string,
  status: number | undefined,
): void => {
  if (!ENABLED || !requestId) return;
  const call = pending.get(requestId);
  if (!call) return;
  pending.delete(requestId);

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const duration = now - call.startedAt;

  if (!window) window = new Map();
  let stat = window.get(call.endpoint);
  if (!stat) {
    stat = {
      count: 0,
      durations: [],
      status2xx: 0,
      status4xx: 0,
      status5xx: 0,
      statusOther: 0,
      resourceCounts: new Map(),
    };
    window.set(call.endpoint, stat);
  }

  stat.count += 1;
  stat.durations.push(duration);
  stat.resourceCounts.set(
    call.resourceKey,
    (stat.resourceCounts.get(call.resourceKey) ?? 0) + 1,
  );

  const code = status ?? 0;
  if (code >= 200 && code < 300) stat.status2xx += 1;
  else if (code >= 400 && code < 500) stat.status4xx += 1;
  else if (code >= 500) stat.status5xx += 1;
  else stat.statusOther += 1;

  scheduleFlush();
};
