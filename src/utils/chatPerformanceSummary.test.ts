import { describe, it, expect } from "vitest";
import {
  getChatPerformanceSummary,
  type ChatPerformanceEvent,
} from "./chatPerformance";

const flush = (eventCount: number, durationMs: number): ChatPerformanceEvent => ({
  name: "fe.realtime.batch.flush",
  measuredAt: new Date().toISOString(),
  details: { eventCount, durationMs },
});

const derive = (
  name: string,
  durationMs: number,
  mode: "cacheHit" | "inPlaceMetadata" | "incrementalAppend" | "full",
): ChatPerformanceEvent => ({
  name,
  measuredAt: new Date().toISOString(),
  durationMs,
  details: mode === "full" ? {} : { [mode]: true },
});

describe("getChatPerformanceSummary", () => {
  it("reports the coalesce ratio for realtime batches (P0)", () => {
    const summary = getChatPerformanceSummary([
      flush(5, 1.2),
      flush(15, 2.0),
    ]);
    expect(summary.realtimeBatch.conversationFlushes).toBe(2);
    expect(summary.realtimeBatch.coalescedEvents).toBe(20);
    expect(summary.realtimeBatch.coalesceRatio).toBe(10); // 20 events / 2 flushes
    expect(summary.realtimeBatch.maxFlushMs).toBe(2.0);
    expect(summary.realtimeBatch.avgFlushMs).toBeCloseTo(1.6);
  });

  it("classifies grouping derivations by path (P1)", () => {
    const summary = getChatPerformanceSummary([
      derive("message-grouping-derive", 0.1, "cacheHit"),
      derive("message-grouping-derive", 0.5, "inPlaceMetadata"),
      derive("message-grouping-derive", 0.4, "inPlaceMetadata"),
      derive("message-grouping-derive", 0.3, "incrementalAppend"),
      derive("message-grouping-derive", 3.2, "full"),
    ]);
    const g = summary.grouping;
    expect(g.total).toBe(5);
    expect(g.cacheHit).toBe(1);
    expect(g.inPlace).toBe(2);
    expect(g.append).toBe(1);
    expect(g.full).toBe(1);
    expect(g.maxMs).toBe(3.2);
  });

  it("separates timeline-row derivations from grouping", () => {
    const summary = getChatPerformanceSummary([
      derive("timeline-row-derive", 0.2, "inPlaceMetadata"),
      derive("message-grouping-derive", 0.2, "full"),
    ]);
    expect(summary.timelineRows.total).toBe(1);
    expect(summary.timelineRows.inPlace).toBe(1);
    expect(summary.grouping.total).toBe(1);
    expect(summary.grouping.full).toBe(1);
  });

  it("is all-zero on an empty event buffer", () => {
    const summary = getChatPerformanceSummary([]);
    expect(summary.realtimeBatch.conversationFlushes).toBe(0);
    expect(summary.realtimeBatch.coalesceRatio).toBe(0);
    expect(summary.grouping.total).toBe(0);
  });
});
