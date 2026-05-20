import { describe, expect, it } from "vitest";
import {
  RSP_BREAKPOINT_MIN,
  buildResponsiveSnapshot,
  resolveChatLayoutBreakpointBand,
  resolveResponsiveBreakpoint,
  resolveScreenCategory,
} from "./responsive";

describe("resolveResponsiveBreakpoint", () => {
  it("classifies widths against RSP_BREAKPOINT_MIN", () => {
    expect(resolveResponsiveBreakpoint(320)).toBe("xs");
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.sm)).toBe("sm");
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.lg - 1)).toBe("md");
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.lg)).toBe("lg");
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.xl)).toBe("xl");
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.ultrawide - 1)).toBe(
      "2xl",
    );
    expect(resolveResponsiveBreakpoint(RSP_BREAKPOINT_MIN.ultrawide)).toBe(
      "ultrawide",
    );
  });
});

describe("resolveScreenCategory", () => {
  it("maps common device buckets", () => {
    expect(resolveScreenCategory(390, 800)).toBe("mobile");
    expect(resolveScreenCategory(834, 1100)).toBe("tablet");
    expect(resolveScreenCategory(1366, 700)).toBe("laptop");
    expect(resolveScreenCategory(1366, 900)).toBe("desktop");
    expect(resolveScreenCategory(2100, 900)).toBe("ultrawide");
  });
});

describe("resolveChatLayoutBreakpointBand", () => {
  it("matches chat shell thresholds", () => {
    expect(resolveChatLayoutBreakpointBand(1023)).toBe("compact");
    expect(resolveChatLayoutBreakpointBand(1024)).toBe("standard");
    expect(resolveChatLayoutBreakpointBand(1279)).toBe("standard");
    expect(resolveChatLayoutBreakpointBand(1280)).toBe("wide");
  });
});

describe("buildResponsiveSnapshot", () => {
  it("includes finite dpr layout factor", () => {
    const snap = buildResponsiveSnapshot(1280, 800, 1280, 800, 2);
    expect(snap.dprLayoutFactor).toBeGreaterThanOrEqual(1);
    expect(snap.dprLayoutFactor).toBeLessThanOrEqual(1.25);
    expect(snap.scaleRatio).toBeGreaterThan(0.9);
    expect(snap.scaleRatio).toBeLessThanOrEqual(1);
  });
});
