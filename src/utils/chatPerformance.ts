import { logMessageDebug } from "./messageDebug";

type ChatPerformanceDetail = Record<string, unknown>;

const MAX_DETAIL_EVENTS = 300;

type ChatPerformanceWindow = Window & {
  __chatPerformanceEvents?: Array<{
    name: string;
    measuredAt: string;
    durationMs?: number;
    details?: ChatPerformanceDetail;
  }>;
  __chatRenderCounts?: Record<string, number>;
};

const isPerfEnvFlagEnabled = (): boolean =>
  import.meta.env.VITE_CHAT_PERF_DEBUG === "true" ||
  import.meta.env.VITE_SOCKET_PERF_DEBUG === "true";

const isPerfQueryFlagEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debugPerformance") === "1"
  );
};

export const isChatPerformanceEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return isPerfEnvFlagEnabled() || (import.meta.env.DEV && isPerfQueryFlagEnabled());
};

const shouldConsoleLogChatPerformance = (): boolean => {
  if (!isChatPerformanceEnabled()) return false;
  return isPerfEnvFlagEnabled() || isPerfQueryFlagEnabled();
};

const sanitizeMarkSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9:_-]/g, "_");

const buildMarkName = (
  name: string,
  conversationId?: string | null,
): string =>
  conversationId
    ? `chat:${sanitizeMarkSegment(name)}:${sanitizeMarkSegment(conversationId)}`
    : `chat:${sanitizeMarkSegment(name)}`;

const recordChatPerformanceEvent = (
  name: string,
  durationMs: number | undefined,
  details?: ChatPerformanceDetail,
): void => {
  if (!isChatPerformanceEnabled()) return;

  const performanceWindow = window as ChatPerformanceWindow;
  const previousEvents = performanceWindow.__chatPerformanceEvents ?? [];
  performanceWindow.__chatPerformanceEvents = [
    ...previousEvents,
    {
      name,
      measuredAt: new Date().toISOString(),
      ...(typeof durationMs === "number" ? { durationMs } : {}),
      ...(details ? { details } : {}),
    },
  ].slice(-MAX_DETAIL_EVENTS);

  if (shouldConsoleLogChatPerformance()) {
    logMessageDebug(
      "chatPerformance",
      name,
      {
        ...(typeof durationMs === "number"
          ? { durationMs: Math.round(durationMs * 100) / 100 }
          : {}),
        ...details,
      },
      { alwaysOn: true, level: "info" },
    );
  }
};

export const markChatPerformance = (
  name: string,
  conversationId?: string | null,
  details?: ChatPerformanceDetail,
): void => {
  if (!isChatPerformanceEnabled()) return;

  const markName = buildMarkName(name, conversationId);
  performance.mark(markName);
  recordChatPerformanceEvent(name, undefined, {
    conversationId: conversationId ?? null,
    ...details,
    markName,
  });
};

export const measureChatPerformance = (
  name: string,
  startName: string,
  conversationId?: string | null,
  details?: ChatPerformanceDetail,
): number | null => {
  if (!isChatPerformanceEnabled()) return null;

  const startMark = buildMarkName(startName, conversationId);
  const endMark = buildMarkName(`${name}:end`, conversationId);
  const measureName = buildMarkName(name, conversationId);

  if (performance.getEntriesByName(startMark, "mark").length === 0) {
    return null;
  }

  performance.mark(endMark);
  performance.measure(measureName, startMark, endMark);
  const entries = performance.getEntriesByName(measureName, "measure");
  const duration = entries[entries.length - 1]?.duration ?? null;

  if (duration !== null) {
    recordChatPerformanceEvent(name, duration, {
      conversationId: conversationId ?? null,
      ...details,
      startMark,
      endMark,
      measureName,
    });
  }

  return duration;
};

export const logChatPerformance = (
  name: string,
  details?: ChatPerformanceDetail,
): void => {
  recordChatPerformanceEvent(name, undefined, details);
};

export const getChatPerformanceTimestamp = (): number =>
  isChatPerformanceEnabled() ? performance.now() : 0;

export const getChatPerformanceDuration = (startedAt: number): number =>
  startedAt > 0 ? performance.now() - startedAt : 0;

export const recordChatPerformanceMeasure = (
  name: string,
  durationMs: number,
  details?: ChatPerformanceDetail,
): void => {
  recordChatPerformanceEvent(name, durationMs, details);
};

export interface ChatPerformanceEvent {
  name: string;
  measuredAt: string;
  durationMs?: number;
  details?: ChatPerformanceDetail;
}

/** Raw recorded events (dev-only buffer; empty when perf debug is disabled). */
export const getChatPerformanceEvents = (): ChatPerformanceEvent[] => {
  if (typeof window === "undefined") return [];
  return (window as ChatPerformanceWindow).__chatPerformanceEvents ?? [];
};

export interface RealtimeBatchSummary {
  /** Number of per-conversation flushes (== updateQueryData calls). */
  conversationFlushes: number;
  /** Total metadata events folded into those flushes. */
  coalescedEvents: number;
  /** Events per flush — the P0 "5 events → 1 derive" compression ratio. */
  coalesceRatio: number;
  avgFlushMs: number;
  maxFlushMs: number;
}

export interface DeriveSummary {
  total: number;
  cacheHit: number;
  /** P1 in-place metadata fast path (no full grouping rebuild). */
  inPlace: number;
  /** Append-only incremental path. */
  append: number;
  /** Full O(n) rebuild — the expensive path we want to stay rare. */
  full: number;
  avgMs: number;
  maxMs: number;
}

export interface ChatPerformanceSummary {
  realtimeBatch: RealtimeBatchSummary;
  grouping: DeriveSummary;
  timelineRows: DeriveSummary;
}

const toFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const summarizeRealtimeBatch = (
  events: readonly ChatPerformanceEvent[],
): RealtimeBatchSummary => {
  const rows = events.filter((event) => event.name === "fe.realtime.batch.flush");
  let coalescedEvents = 0;
  let totalMs = 0;
  let maxFlushMs = 0;
  for (const row of rows) {
    coalescedEvents += toFiniteNumber(row.details?.eventCount);
    const ms = toFiniteNumber(row.details?.durationMs);
    totalMs += ms;
    if (ms > maxFlushMs) maxFlushMs = ms;
  }
  return {
    conversationFlushes: rows.length,
    coalescedEvents,
    coalesceRatio: rows.length > 0 ? coalescedEvents / rows.length : 0,
    avgFlushMs: rows.length > 0 ? totalMs / rows.length : 0,
    maxFlushMs,
  };
};

const summarizeDerive = (
  events: readonly ChatPerformanceEvent[],
  name: string,
): DeriveSummary => {
  const rows = events.filter((event) => event.name === name);
  let cacheHit = 0;
  let inPlace = 0;
  let append = 0;
  let full = 0;
  let totalMs = 0;
  let maxMs = 0;
  for (const row of rows) {
    const details = row.details ?? {};
    if (details.cacheHit === true) cacheHit += 1;
    else if (details.inPlaceMetadata === true) inPlace += 1;
    else if (details.incrementalAppend === true) append += 1;
    else full += 1;
    const ms = toFiniteNumber(row.durationMs);
    totalMs += ms;
    if (ms > maxMs) maxMs = ms;
  }
  return {
    total: rows.length,
    cacheHit,
    inPlace,
    append,
    full,
    avgMs: rows.length > 0 ? totalMs / rows.length : 0,
    maxMs,
  };
};

/**
 * Aggregate the recorded chat-performance marks into a compact summary that
 * makes the P0 (event coalescing) and P1 (in-place vs full rebuild) behavior
 * directly observable. Pure over the supplied events for easy testing.
 */
export const getChatPerformanceSummary = (
  events: readonly ChatPerformanceEvent[] = getChatPerformanceEvents(),
): ChatPerformanceSummary => ({
  realtimeBatch: summarizeRealtimeBatch(events),
  grouping: summarizeDerive(events, "message-grouping-derive"),
  timelineRows: summarizeDerive(events, "timeline-row-derive"),
});

export const recordChatRenderCount = (
  componentName: string,
  instanceKey: string,
  details?: ChatPerformanceDetail,
): void => {
  if (!isChatPerformanceEnabled()) return;

  const performanceWindow = window as ChatPerformanceWindow;
  const counterKey = `${componentName}:${instanceKey}`;
  const counts = performanceWindow.__chatRenderCounts ?? {};
  const nextCount = (counts[counterKey] ?? 0) + 1;
  performanceWindow.__chatRenderCounts = {
    ...counts,
    [counterKey]: nextCount,
  };

  recordChatPerformanceEvent("chat-render-count", undefined, {
    componentName,
    instanceKey,
    renderCount: nextCount,
    ...details,
  });
};
