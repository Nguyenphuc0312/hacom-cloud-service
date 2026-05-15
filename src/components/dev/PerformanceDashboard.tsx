/**
 * @fileoverview Performance Monitoring Dashboard
 *
 * Phase 3: Real-time performance metrics overlay for development.
 * Only rendered when VITE_ENABLE_API_PERF_LOG=true or in DEV mode.
 *
 * Usage:
 *   import { PerformanceDashboard } from './PerformanceDashboard';
 *   <PerformanceDashboard />
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiPerfLogger } from "../../utils/apiPerfLogger";

interface MetricData {
  total: number;
  hits: number;
  misses: number;
  deduped: number;
  markRead: number;
  inFlight: number;
}

interface ApiCallEntry {
  timestamp: number;
  method: string;
  endpoint: string;
  duration: number;
  status: number;
  cached: boolean;
  type: string;
}

const MAX_LOG_ENTRIES = 100;

export const PerformanceDashboard: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [metrics, setMetrics] = useState<MetricData>({
    total: 0,
    hits: 0,
    misses: 0,
    deduped: 0,
    markRead: 0,
    inFlight: 0,
  });
  const [logs, setLogs] = useState<ApiCallEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const logIdRef = useRef(0);

  // Check if dashboard should be enabled
  const isEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_API_PERF_LOG === "true";

  useEffect(() => {
    if (!isEnabled) return;

    // Listen for console logs from apiPerfLogger
    const originalLog = console.log;
    const handleLog = (...args: unknown[]) => {
      const firstArg = args[0];
      if (typeof firstArg === "string" && firstArg.includes("[api-perf]")) {
        const logEntry = parseApiPerfLog(args);
        if (logEntry) {
          logIdRef.current += 1;
          setLogs((prev) => [
            { ...logEntry, type: `log-${logIdRef.current}` },
            ...prev.slice(0, MAX_LOG_ENTRIES - 1),
          ]);
        }
      }
    };

    // Override console.log to capture api-perf logs
    console.log = (...args: unknown[]) => {
      handleLog(...args);
      originalLog.apply(console, args);
    };

    // Update metrics every second
    const metricsInterval = setInterval(() => {
      const currentMetrics = apiPerfLogger.getMetrics();
      setMetrics({
        total: currentMetrics.apiCalls,
        hits: currentMetrics.cacheHits,
        misses: currentMetrics.apiCalls - currentMetrics.cacheHits,
        deduped: currentMetrics.dedupedCalls,
        markRead: currentMetrics.markReadCalls,
        inFlight: currentMetrics.inFlightCalls,
      });
    }, 1000);

    return () => {
      console.log = originalLog;
      clearInterval(metricsInterval);
    };
  }, [isEnabled]);

  // Keyboard shortcut to toggle dashboard (Ctrl+Shift+P)
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setIsVisible((prev) => !prev);
      }
      if (e.key === "Escape" && isVisible) {
        setIsVisible(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, isVisible]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    apiPerfLogger.resetMetrics();
    logIdRef.current = 0;
  }, []);

  if (!isEnabled || !isVisible) return null;

  const hitRate =
    metrics.total > 0
      ? Math.round((metrics.hits / metrics.total) * 100)
      : 0;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 999999,
        fontFamily:
          "'SF Mono', Monaco, 'Courier New', monospace",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "#1a1a2e",
          border: "1px solid #333",
          color: "#00ff88",
          fontSize: 16,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}
        title="Toggle Performance Dashboard (Ctrl+Shift+P)"
      >
        📊
      </button>

      {/* Dashboard Panel */}
      {expanded && (
        <div
          style={{
            width: 420,
            maxHeight: "70vh",
            background: "#1a1a2e",
            border: "1px solid #333",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              background: "#16213e",
              borderBottom: "1px solid #333",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#00ff88", fontWeight: 600 }}>
              API Performance Monitor
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={clearLogs}
                style={{
                  padding: "4px 8px",
                  background: "#333",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 10,
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setIsVisible(false)}
                style={{
                  padding: "4px 8px",
                  background: "#e74c3c",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 10,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Summary Metrics */}
          <div
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              borderBottom: "1px solid #333",
            }}
          >
            <MetricBox
              label="Total"
              value={metrics.total}
              color="#4a9eff"
            />
            <MetricBox
              label="Cache Hit"
              value={metrics.hits}
              color="#00ff88"
              subtitle={`${hitRate}%`}
            />
            <MetricBox
              label="Deduped"
              value={metrics.deduped}
              color="#ffaa00"
            />
            <MetricBox
              label="Mark Read"
              value={metrics.markRead}
              color="#ff6b6b"
            />
            <MetricBox
              label="In-Flight"
              value={metrics.inFlight}
              color="#a855f7"
            />
            <MetricBox
              label="Misses"
              value={metrics.misses}
              color="#6b7280"
            />
          </div>

          {/* Log List */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: 8,
              maxHeight: 300,
            }}
          >
            {logs.length === 0 ? (
              <div
                style={{
                  color: "#666",
                  textAlign: "center",
                  padding: 20,
                }}
              >
                No API calls recorded yet.
                <br />
                <span style={{ fontSize: 10 }}>
                  Trigger some API activity to see metrics.
                </span>
              </div>
            ) : (
              logs.map((log) => (
                <LogEntry key={log.type} entry={log} />
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "8px 16px",
              background: "#16213e",
              borderTop: "1px solid #333",
              fontSize: 9,
              color: "#666",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Press Ctrl+Shift+P to toggle</span>
            <span>Press Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface MetricBoxProps {
  label: string;
  value: number;
  color: string;
  subtitle?: string;
}

const MetricBox: React.FC<MetricBoxProps> = ({
  label,
  value,
  color,
  subtitle,
}) => (
  <div
    style={{
      background: "#0f0f1a",
      borderRadius: 6,
      padding: "8px 10px",
      textAlign: "center",
    }}
  >
    <div style={{ color: "#888", fontSize: 9 }}>{label}</div>
    <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
    {subtitle && (
      <div style={{ color: "#666", fontSize: 9 }}>{subtitle}</div>
    )}
  </div>
);

interface LogEntryProps {
  entry: ApiCallEntry;
}

const LogEntry: React.FC<LogEntryProps> = ({ entry }) => {
  const methodColor = {
    GET: "#4a9eff",
    POST: "#00ff88",
    PUT: "#ffaa00",
    PATCH: "#a855f7",
    DELETE: "#ff6b6b",
    QUERY: "#4a9eff",
    MUTATION: "#00ff88",
  }[entry.method] || "#fff";

  const statusColor =
    entry.status >= 200 && entry.status < 300
      ? "#00ff88"
      : entry.status >= 400
        ? "#ff6b6b"
        : "#ffaa00";

  const cacheColor = entry.cached ? "#00ff88" : "#666";

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "4px 8px",
        borderBottom: "1px solid #222",
        fontSize: 10,
      }}
    >
      <span style={{ color: "#666", minWidth: 60 }}>
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>
      <span style={{ color: methodColor, minWidth: 70 }}>{entry.method}</span>
      <span
        style={{
          color: "#fff",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={entry.endpoint}
      >
        {formatEndpoint(entry.endpoint)}
      </span>
      <span style={{ color: "#888", minWidth: 50 }}>
        {entry.duration}ms
      </span>
      <span style={{ color: statusColor, minWidth: 30 }}>
        {entry.status}
      </span>
      <span style={{ color: cacheColor, minWidth: 40 }}>
        {entry.cached ? "HIT" : "MISS"}
      </span>
    </div>
  );
};

const formatEndpoint = (endpoint: string): string => {
  // Truncate conversation IDs
  const truncated = endpoint.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (match) => `...${match.slice(-8)}`,
  );
  // Truncate long paths
  if (truncated.length > 40) {
    return "..." + truncated.slice(-37);
  }
  return truncated;
};

const parseApiPerfLog = (args: unknown[]): ApiCallEntry | null => {
  const message = String(args[0]);
  try {
    // Parse "[api-perf] METHOD ENDPOINT DURATIONms status=XXX cache=hit/miss"
    const match = message.match(
      /\[api-perf\]\s+(\w+)\s+(\S+)\s+(\d+)ms\s+status=(\d+)\s+cache=(hit|miss)/,
    );
    if (match) {
      return {
        timestamp: Date.now(),
        method: match[1],
        endpoint: match[2],
        duration: parseInt(match[3], 10),
        status: parseInt(match[4], 10),
        cached: match[5] === "hit",
        type: "",
      };
    }

    // Parse "[api-perf] DEDUPED type=..."
    const dedupeMatch = message.match(
      /\[api-perf\]\s+DEDUPED\s+type=(\S+)/,
    );
    if (dedupeMatch) {
      return {
        timestamp: Date.now(),
        method: "DEDUP",
        endpoint: dedupeMatch[1],
        duration: 0,
        status: 0,
        cached: false,
        type: "",
      };
    }

    // Parse "[api-perf] MARK_READ ..."
    if (message.includes("MARK_READ")) {
      return {
        timestamp: Date.now(),
        method: "MARK",
        endpoint: "read",
        duration: 0,
        status: 0,
        cached: false,
        type: "",
      };
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

export default PerformanceDashboard;
