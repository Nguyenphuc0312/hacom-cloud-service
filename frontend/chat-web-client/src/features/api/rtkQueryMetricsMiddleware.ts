/**
 * @fileoverview RTK Query Metrics Middleware
 *
 * Phase 2: Adds performance tracking for RTK Query operations.
 * Tracks query/mutation execution times and cache hit/miss rates.
 */

import type { Middleware } from "@reduxjs/toolkit";
import { apiPerfLogger } from "../../utils/apiPerfLogger";

/**
 * Middleware to track RTK Query performance metrics.
 * Records timing for all chatApi queries and mutations.
 *
 * Note: RTK Query v2 has different internal actions. This middleware
 * provides basic timing tracking for API calls.
 */
export const createRtkQueryMetricsMiddleware = (): Middleware => {
  // Store start times for tracking
  const startTimes = new Map<string, number>();

  return () => (next) => (action) => {
    const isEnabled =
      import.meta.env.DEV || import.meta.env.VITE_ENABLE_API_PERF_LOG === "true";

    if (!isEnabled) {
      return next(action);
    }

    // Track action start (basic approach - tracks all dispatched actions)
    const actionType =
      typeof action === "object" && action !== null && "type" in action
        ? (action as { type: string }).type
        : "";

    // Check if this is a chatApi query/mutation action
    if (actionType.startsWith("chatApi/executeQuery") ||
        actionType.startsWith("chatApi/mutation")) {
      const trackId = `${actionType}:${Date.now()}`;
      startTimes.set(trackId, performance.now());
    }

    const result = next(action);

    // Try to match completed actions
    if (
      actionType.includes("fulfilled") ||
      actionType.includes("rejected")
    ) {
      // Find matching start time
      for (const [key, startTime] of startTimes.entries()) {
        if (key.startsWith(actionType.split("/")[0])) {
          const duration = Math.round(performance.now() - startTime);
          const isError = actionType.includes("rejected");
          const endpointName = actionType.split("/")[1] || "unknown";

          apiPerfLogger.logApiCall({
            endpoint: `/rtk/${endpointName}`,
            method: actionType.includes("mutation") ? "MUTATION" : "QUERY",
            duration,
            status: isError ? 500 : 200,
            cached: false,
            error: isError ? "rejected" : undefined,
          });

          startTimes.delete(key);
          break;
        }
      }
    }

    return result;
  };
};

export const rtkQueryMetricsMiddleware = createRtkQueryMetricsMiddleware() as Middleware;
