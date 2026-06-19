import { describe, expect, it } from "vitest";
import {
  RSP_BREAKPOINT_MIN,
  buildResponsiveSnapshot,
  computeAppZoom,
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
    expect(resolveChatLayoutBreakpointBand(767)).toBe("compact");
    expect(resolveChatLayoutBreakpointBand(768)).toBe("standard");
    // Cửa sổ desktop tối thiểu 1024px có viewport thực ~1008px (viền cửa sổ):
    // vẫn phải là layout hai cột, không rơi về compact.
    expect(resolveChatLayoutBreakpointBand(1008)).toBe("standard");
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

  it("carries a 1:1 app zoom factor in the snapshot (zoom disabled)", () => {
    expect(buildResponsiveSnapshot(1280, 800, 1280, 800, 1).appZoom).toBe(1);
    expect(buildResponsiveSnapshot(3440, 1440, 3440, 1440, 1).appZoom).toBe(1);
  });
});

describe("computeAppZoom", () => {
  // App-wide CSS zoom is disabled (it broke fixed positioning + viewport units
  // on ultrawide). The UI scales via the fluid responsive system instead, so
  // this helper is a stable 1:1 no-op on every screen width.
  it("always returns 1 regardless of screen width", () => {
    expect(computeAppZoom(1366)).toBe(1);
    expect(computeAppZoom(1920)).toBe(1);
    expect(computeAppZoom(2560)).toBe(1);
    expect(computeAppZoom(3440)).toBe(1);
    expect(computeAppZoom(5120)).toBe(1);
  });

  it("is resilient to non-finite input", () => {
    expect(computeAppZoom(Number.NaN)).toBe(1);
  });
});
