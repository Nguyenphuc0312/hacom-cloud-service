/**
 * Opt-in, redacted image-performance signals for staging/canary analysis.
 * Conversation/file identifiers and signed URLs are used only for local lookup
 * and are never included in dispatched telemetry payloads.
 */
export type ImagePerformanceMilestone =
  | "T0"
  | "T1"
  | "T2"
  | "T3"
  | "T4"
  | "T5"
  | "T6"
  | "T7"
  | "T8"
  | "T9"
  | "T10";

export type ImageNavigationScenario = "fresh" | "warm" | "return";

export type ImagePerformanceEvent = {
  platform?: "web";
  kind:
    | "batch_url_request"
    | "inflight_dedupe"
    | "placeholder_painted"
    | "image_painted"
    | "trace_milestone";
  milestone?: ImagePerformanceMilestone;
  scenario?: ImageNavigationScenario;
  elapsedMs?: number;
  ttfpMs?: number;
  ttftMs?: number;
  ttspMs?: number;
  durationMs?: number;
  queueWaitMs?: number;
  batchSize?: number;
  subscriberCount?: number;
  deduplicatedIds?: number;
  width?: number;
  height?: number;
  outcome?: "success" | "error";
  requestStartMs?: number;
  responseStartMs?: number;
  responseEndMs?: number;
  decodeDurationMs?: number;
  transferSize?: number;
  encodedBodySize?: number;
  renderedWidth?: number;
  renderedHeight?: number;
  cacheLayer?: "browser-byte-cache" | "network-or-opaque" | "unknown";
};

type TraceState = {
  startedAtMs: number;
  sampled: boolean;
  milestones: Set<ImagePerformanceMilestone>;
};

const DEFAULT_SAMPLE_RATE = 0.1;
const MAX_RECENT_TRACES = 4;
const MAX_SEEN_CONVERSATIONS = 100;
const traces = new Map<string, TraceState>();
const seenConversationKeys = new Set<string>();

const enabled = (): boolean =>
  import.meta.env.VITE_IMAGE_PERFORMANCE_TELEMETRY_ENABLED === "true";

const sampleRate = (): number => {
  const configured = Number(
    import.meta.env.VITE_IMAGE_PERFORMANCE_TELEMETRY_SAMPLE_RATE,
  );
  return Number.isFinite(configured) && configured >= 0 && configured <= 1
    ? configured
    : DEFAULT_SAMPLE_RATE;
};

const roundMs = (value: number): number => Math.max(0, Math.round(value));

const dispatchRedacted = (event: ImagePerformanceEvent): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("chat:image-performance", {
      detail: { platform: "web", ...event },
    }),
  );
};

/** Starts one coherent sampled trace at the canonical conversation-selection action. */
export const beginImagePerformanceTrace = (
  conversationKey: string,
  options: { hasCachedTimeline?: boolean } = {},
): void => {
  if (!enabled() || typeof window === "undefined" || !conversationKey) return;

  const scenario: ImageNavigationScenario = seenConversationKeys.has(
    conversationKey,
  )
    ? "return"
    : options.hasCachedTimeline
      ? "warm"
      : "fresh";
  seenConversationKeys.delete(conversationKey);
  seenConversationKeys.add(conversationKey);
  while (seenConversationKeys.size > MAX_SEEN_CONVERSATIONS) {
    const oldestKey = seenConversationKeys.values().next().value as
      | string
      | undefined;
    if (!oldestKey) break;
    seenConversationKeys.delete(oldestKey);
  }

  const trace: TraceState = {
    startedAtMs: performance.now(),
    sampled: Math.random() < sampleRate(),
    milestones: new Set(["T0"]),
  };
  traces.delete(conversationKey);
  traces.set(conversationKey, trace);
  while (traces.size > MAX_RECENT_TRACES) {
    const oldestKey = traces.keys().next().value as string | undefined;
    if (!oldestKey) break;
    traces.delete(oldestKey);
  }

  if (trace.sampled) {
    dispatchRedacted({
      kind: "trace_milestone",
      milestone: "T0",
      scenario,
      elapsedMs: 0,
      durationMs: 0,
      outcome: "success",
    });
  }
};

export const markImagePerformanceMilestone = (
  conversationKey: string,
  milestone: ImagePerformanceMilestone,
  details: Omit<
    ImagePerformanceEvent,
    "kind" | "milestone" | "elapsedMs" | "ttfpMs" | "ttftMs" | "ttspMs"
  > = {},
  occurredAtMs: number = performance.now(),
): void => {
  const trace = traces.get(conversationKey);
  if (!trace || !trace.sampled || trace.milestones.has(milestone)) return;

  trace.milestones.add(milestone);
  const elapsedMs = roundMs(occurredAtMs - trace.startedAtMs);
  dispatchRedacted({
    kind: "trace_milestone",
    milestone,
    elapsedMs,
    ...(milestone === "T3" ? { ttfpMs: elapsedMs } : {}),
    ...(milestone === "T9" ? { ttftMs: elapsedMs } : {}),
    ...(milestone === "T10" ? { ttspMs: elapsedMs } : {}),
    ...details,
  });
};

/** Reports a supporting event only when its whole conversation trace was sampled. */
export const reportImagePerformance = (
  conversationKey: string,
  event: ImagePerformanceEvent,
): void => {
  const trace = traces.get(conversationKey);
  if (!enabled() || !trace?.sampled) return;
  dispatchRedacted(event);
};

/** Runs after a committed frame has had an opportunity to paint. */
export const afterNextPaint = (callback: () => void): (() => void) => {
  if (typeof requestAnimationFrame !== "function") {
    const timeoutId = window.setTimeout(callback, 0);
    return () => window.clearTimeout(timeoutId);
  }
  let secondFrame = 0;
  const firstFrame = requestAnimationFrame(() => {
    secondFrame = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(firstFrame);
    if (secondFrame) cancelAnimationFrame(secondFrame);
  };
};

/** Extract timing fields without returning or emitting the sensitive URL used
 * to look it up. Cross-origin timing may be opaque; that is reported as
 * unknown instead of guessed. */
export const getRedactedResourceTiming = (
  src: string,
): Pick<
  ImagePerformanceEvent,
  | "requestStartMs"
  | "responseStartMs"
  | "responseEndMs"
  | "transferSize"
  | "encodedBodySize"
  | "cacheLayer"
> => {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByName !== "function"
  ) {
    return {};
  }
  const entries = performance.getEntriesByName(src, "resource");
  const entry = entries[entries.length - 1] as
    | PerformanceResourceTiming
    | undefined;
  if (!entry) return { cacheLayer: "unknown" };
  const hasSizes =
    typeof entry.transferSize === "number" &&
    typeof entry.encodedBodySize === "number";
  const hasDetailedTiming =
    entry.requestStart > 0 &&
    entry.responseStart >= entry.requestStart &&
    entry.responseEnd >= entry.responseStart;
  return {
    ...(hasDetailedTiming
      ? {
          requestStartMs: Math.round(entry.requestStart),
          responseStartMs: Math.round(entry.responseStart),
          responseEndMs: Math.round(entry.responseEnd),
        }
      : {}),
    ...(hasSizes
      ? {
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
        }
      : {}),
    cacheLayer:
      hasSizes && entry.transferSize === 0 && entry.encodedBodySize > 0
        ? "browser-byte-cache"
        : hasSizes && entry.transferSize > 0
          ? "network-or-opaque"
          : "unknown",
  };
};

export const __imagePerformanceTelemetryTestUtils = {
  clearTraces: (): void => {
    traces.clear();
    seenConversationKeys.clear();
  },
  defaultSampleRate: DEFAULT_SAMPLE_RATE,
};
