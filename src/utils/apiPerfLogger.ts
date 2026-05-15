/**
 * @fileoverview API Performance Logger for Phase 1 Optimization
 *
 * Lightweight instrumentation to track API calls in dev/staging.
 * Only active when VITE_ENABLE_API_PERF_LOG=true or in DEV mode.
 *
 * Usage:
 *   import { apiPerfLogger } from './apiPerfLogger';
 *   apiPerfLogger.logApiCall({ endpoint: '/conversations', duration: 182, status: 200, cached: true });
 */

export type ApiPerfEventType =
  | "api_call"
  | "cache_hit"
  | "cache_miss"
  | "dedupe_blocked"
  | "debounce_coalesced"
  | "mark_read"
  | "conversation_refresh"
  | "user_search";

export interface ApiPerfLogEntry {
  type: ApiPerfEventType;
  timestamp: number;
  endpoint?: string;
  method?: string;
  duration?: number;
  status?: number;
  cached?: boolean;
  deduped?: boolean;
  conversationId?: string;
  reason?: string;
  query?: string;
  lastReadSeq?: number;
  messageCount?: number;
  deduplicated?: boolean;
}

const API_PERF_ENABLED =
  import.meta.env.DEV ||
  import.meta.env.VITE_ENABLE_API_PERF_LOG === "true";

interface ApiCallTracker {
  startTime: number;
  endpoint: string;
  method: string;
}

// In-flight API call tracker to calculate duration
const inFlightCalls = new Map<string, ApiCallTracker>();

// Performance metrics summary
const metrics = {
  apiCalls: 0,
  cacheHits: 0,
  dedupedCalls: 0,
  markReadCalls: 0,
};

const formatEndpoint = (endpoint: string): string => {
  // Truncate conversation IDs for readability
  return endpoint.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (match) => `...${match.slice(-8)}`,
  );
};

const logEntry = (entry: ApiPerfLogEntry): void => {
  if (!API_PERF_ENABLED) return;

  const prefix = "[api-perf]";

  switch (entry.type) {
    case "api_call": {
      const cacheStatus = entry.cached ? "cache=hit" : "cache=miss";
      console.log(
        `${prefix} ${entry.method ?? "GET"} ${formatEndpoint(entry.endpoint ?? "")} ${entry.duration ?? 0}ms status=${entry.status ?? 0} ${cacheStatus}`,
      );
      break;
    }
    case "cache_hit": {
      console.log(
        `${prefix} CACHE_HIT type=${entry.endpoint} query=${entry.query ?? "N/A"} results=${entry.messageCount ?? 0}`,
      );
      break;
    }
    case "cache_miss": {
      console.log(
        `${prefix} CACHE_MISS type=${entry.endpoint} query=${entry.query ?? "N/A"}`,
      );
      break;
    }
    case "dedupe_blocked": {
      console.log(
        `${prefix} DEDUPED type=${entry.endpoint ?? entry.type} conversationId=${entry.conversationId ?? "N/A"} reason=${entry.reason ?? "N/A"}`,
      );
      break;
    }
    case "debounce_coalesced": {
      console.log(
        `${prefix} DEBOUNCE_COALESCED type=${entry.type} conversationId=${entry.conversationId ?? "N/A"} lastReadSeq=${entry.lastReadSeq ?? "N/A"}`,
      );
      break;
    }
    case "mark_read": {
      console.log(
        `${prefix} MARK_READ conversationId=${entry.conversationId ?? "N/A"} lastReadSeq=${entry.lastReadSeq ?? "N/A"}`,
      );
      break;
    }
    case "conversation_refresh": {
      console.log(
        `${prefix} CONVERSATION_REFRESH conversationId=${entry.conversationId ?? "N/A"} reason=${entry.reason ?? "N/A"} deduplicated=${entry.deduplicated ?? false}`,
      );
      break;
    }
    case "user_search": {
      const cached = entry.cached ? "CACHE_HIT" : "CACHE_MISS";
      console.log(
        `${prefix} USER_SEARCH query="${entry.query ?? ""}" results=${entry.messageCount ?? 0} ${cached}`,
      );
      break;
    }
    default: {
      console.log(`${prefix} ${JSON.stringify(entry)}`);
    }
  }
};

export const apiPerfLogger = {
  /**
   * Track start of an API call
   */
  startApiCall: (endpoint: string, method: string = "GET"): string => {
    if (!API_PERF_ENABLED) return "";

    const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    inFlightCalls.set(callId, {
      startTime: performance.now(),
      endpoint,
      method,
    });
    metrics.apiCalls++;
    return callId;
  },

  /**
   * Track end of an API call with duration
   */
  endApiCall: (
    callId: string,
    status: number,
    cached: boolean = false,
  ): void => {
    if (!API_PERF_ENABLED || !callId) return;

    const tracker = inFlightCalls.get(callId);
    if (!tracker) return;

    const duration = Math.round(performance.now() - tracker.startTime);
    inFlightCalls.delete(callId);

    logEntry({
      type: "api_call",
      timestamp: Date.now(),
      endpoint: tracker.endpoint,
      method: tracker.method,
      duration,
      status,
      cached,
    });

    if (cached) {
      metrics.cacheHits++;
    }
  },

  /**
   * Log cache hit
   */
  logCacheHit: (
    type: string,
    query?: string,
    resultCount?: number,
  ): void => {
    logEntry({
      type: "cache_hit",
      timestamp: Date.now(),
      endpoint: type,
      query,
      messageCount: resultCount,
      cached: true,
    });
    metrics.cacheHits++;
  },

  /**
   * Log cache miss
   */
  logCacheMiss: (type: string, query?: string): void => {
    logEntry({
      type: "cache_miss",
      timestamp: Date.now(),
      endpoint: type,
      query,
      cached: false,
    });
  },

  /**
   * Log deduplicated call
   */
  logDedupeBlocked: (
    type: string,
    conversationId?: string,
    reason?: string,
  ): void => {
    logEntry({
      type: "dedupe_blocked",
      timestamp: Date.now(),
      endpoint: type,
      conversationId,
      reason,
      deduped: true,
    });
    metrics.dedupedCalls++;
  },

  /**
   * Log debounced mark read
   */
  logMarkRead: (conversationId: string, lastReadSeq?: number): void => {
    logEntry({
      type: "mark_read",
      timestamp: Date.now(),
      conversationId,
      lastReadSeq,
    });
    metrics.markReadCalls++;
  },

  /**
   * Log conversation refresh
   */
  logConversationRefresh: (
    conversationId: string,
    reason: string,
    deduplicated: boolean = false,
  ): void => {
    logEntry({
      type: "conversation_refresh",
      timestamp: Date.now(),
      conversationId,
      reason,
      deduplicated,
    });
  },

  /**
   * Log user search
   */
  logUserSearch: (
    query: string,
    resultCount: number,
    cached: boolean,
  ): void => {
    logEntry({
      type: "user_search",
      timestamp: Date.now(),
      query,
      messageCount: resultCount,
      cached,
    });
  },

  /**
   * Get current metrics summary
   */
  getMetrics: () => ({
    ...metrics,
    inFlightCalls: inFlightCalls.size,
  }),

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics: (): void => {
    metrics.apiCalls = 0;
    metrics.cacheHits = 0;
    metrics.dedupedCalls = 0;
    metrics.markReadCalls = 0;
    inFlightCalls.clear();
  },

  /**
   * Print metrics summary to console
   */
  printSummary: (): void => {
    if (!API_PERF_ENABLED) return;

    console.group("[api-perf] Metrics Summary");
    console.log(`API Calls: ${metrics.apiCalls}`);
    console.log(`Cache Hits: ${metrics.cacheHits}`);
    console.log(`Deduplicated Calls: ${metrics.dedupedCalls}`);
    console.log(`Mark Read Calls: ${metrics.markReadCalls}`);
    console.log(`In-Flight Calls: ${inFlightCalls.size}`);
    console.groupEnd();
  },
};

export default apiPerfLogger;
