import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __imagePerformanceTelemetryTestUtils,
  beginImagePerformanceTrace,
  getRedactedResourceTiming,
  markImagePerformanceMilestone,
  reportImagePerformance,
  type ImagePerformanceEvent,
} from "./imagePerformanceTelemetry";

describe("imagePerformanceTelemetry", () => {
  const events: ImagePerformanceEvent[] = [];
  const listener = (event: Event) => {
    events.push((event as CustomEvent<ImagePerformanceEvent>).detail);
  };

  beforeEach(() => {
    vi.stubEnv("VITE_IMAGE_PERFORMANCE_TELEMETRY_ENABLED", "true");
    __imagePerformanceTelemetryTestUtils.clearTraces();
    events.length = 0;
    window.addEventListener("chat:image-performance", listener);
  });

  afterEach(() => {
    window.removeEventListener("chat:image-performance", listener);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("samples once for a coherent trace and derives TTFP/TTFT/TTSP", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.spyOn(performance, "now").mockReturnValue(100);

    beginImagePerformanceTrace("private-conversation-id");
    vi.mocked(Math.random).mockReturnValue(0.99);
    markImagePerformanceMilestone(
      "private-conversation-id",
      "T3",
      { outcome: "success" },
      125,
    );
    markImagePerformanceMilestone(
      "private-conversation-id",
      "T9",
      { outcome: "success" },
      180,
    );
    markImagePerformanceMilestone(
      "private-conversation-id",
      "T10",
      { outcome: "success" },
      260,
    );
    reportImagePerformance("private-conversation-id", {
      kind: "batch_url_request",
      batchSize: 20,
      outcome: "success",
    });

    expect(events).toEqual([
      expect.objectContaining({
        milestone: "T0",
        elapsedMs: 0,
        scenario: "fresh",
      }),
      expect.objectContaining({ milestone: "T3", elapsedMs: 25, ttfpMs: 25 }),
      expect.objectContaining({ milestone: "T9", elapsedMs: 80, ttftMs: 80 }),
      expect.objectContaining({ milestone: "T10", elapsedMs: 160, ttspMs: 160 }),
      expect.objectContaining({ kind: "batch_url_request", batchSize: 20 }),
    ]);
  });

  it("records each milestone once and never emits the internal trace key", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(performance, "now").mockReturnValue(10);
    const privateKey = "conversation-with-sensitive-id";

    beginImagePerformanceTrace(privateKey);
    markImagePerformanceMilestone(privateKey, "T4", {}, 20);
    markImagePerformanceMilestone(privateKey, "T4", {}, 30);

    expect(events.filter((event) => event.milestone === "T4")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(privateKey);
    expect(JSON.stringify(events)).not.toContain("http");
  });

  it("emits no partial events when the trace is not sampled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    vi.spyOn(performance, "now").mockReturnValue(10);

    beginImagePerformanceTrace("not-sampled");
    markImagePerformanceMilestone("not-sampled", "T3", {}, 20);
    reportImagePerformance("not-sampled", {
      kind: "placeholder_painted",
    });

    expect(events).toEqual([]);
  });

  it("allows a bounded 100% sample rate for controlled benchmark builds", () => {
    vi.stubEnv("VITE_IMAGE_PERFORMANCE_TELEMETRY_SAMPLE_RATE", "1");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    vi.spyOn(performance, "now").mockReturnValue(10);

    beginImagePerformanceTrace("benchmark-trace");

    expect(events).toEqual([
      expect.objectContaining({ milestone: "T0", elapsedMs: 0 }),
    ]);
  });

  it("does not misclassify opaque zero-size resource timing as a cache hit", () => {
    const entry = (
      transferSize: number,
      encodedBodySize: number,
      hasDetailedTiming = true,
    ) =>
      ({
        requestStart: hasDetailedTiming ? 10 : 0,
        responseStart: hasDetailedTiming ? 20 : 0,
        responseEnd: hasDetailedTiming ? 30 : 0,
        transferSize,
        encodedBodySize,
      }) as PerformanceResourceTiming;
    const timingSpy = vi.spyOn(performance, "getEntriesByName");

    timingSpy.mockReturnValue([entry(0, 0, false)]);
    expect(getRedactedResourceTiming("private-url")).toEqual({
      transferSize: 0,
      encodedBodySize: 0,
      cacheLayer: "unknown",
    });

    timingSpy.mockReturnValue([entry(0, 100)]);
    expect(getRedactedResourceTiming("private-url").cacheLayer).toBe(
      "browser-byte-cache",
    );

    timingSpy.mockReturnValue([entry(120, 100)]);
    expect(getRedactedResourceTiming("private-url").cacheLayer).toBe(
      "network-or-opaque",
    );
  });

  it("separates a cached first open from a return without emitting its key", () => {
    vi.stubEnv("VITE_IMAGE_PERFORMANCE_TELEMETRY_SAMPLE_RATE", "1");
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(performance, "now").mockReturnValue(10);
    const privateKey = "private-return-conversation";

    beginImagePerformanceTrace(privateKey, { hasCachedTimeline: true });
    beginImagePerformanceTrace(privateKey, { hasCachedTimeline: true });

    expect(events.map((event) => event.scenario)).toEqual(["warm", "return"]);
    expect(JSON.stringify(events)).not.toContain(privateKey);
  });
});
