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
};

const isChatPerformanceEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV;
};

const shouldConsoleLogChatPerformance = (): boolean => {
  if (!isChatPerformanceEnabled()) return false;
  return (
    new URLSearchParams(window.location.search).get("debugPerformance") === "1"
  );
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

export const recordChatPerformanceMeasure = (
  name: string,
  durationMs: number,
  details?: ChatPerformanceDetail,
): void => {
  recordChatPerformanceEvent(name, durationMs, details);
};
