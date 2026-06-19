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

  it("carries the app zoom factor in the snapshot", () => {
    expect(buildResponsiveSnapshot(1280, 800, 1280, 800, 1).appZoom).toBe(1);
    expect(buildResponsiveSnapshot(3440, 1440, 3440, 1440, 1).appZoom).toBe(1.35);
  });

  it("drives app zoom from the physical screen width, not the layout width", () => {
    // Narrow window (1100px) on a 3440px monitor → still zoomed for the monitor.
    expect(
      buildResponsiveSnapshot(1100, 900, 1100, 900, 1, 3440).appZoom,
    ).toBe(1.35);
    // Wide layout (browser zoomed out) on a 1920px laptop → no UI zoom.
    expect(
      buildResponsiveSnapshot(2400, 1000, 2400, 1000, 1, 1920).appZoom,
    ).toBe(1);
  });
});

describe("computeAppZoom", () => {
  it("stays 1 for laptops / FHD monitors (≤1920)", () => {
    expect(computeAppZoom(1366)).toBe(1);
    expect(computeAppZoom(1600)).toBe(1);
    expect(computeAppZoom(1920)).toBe(1);
  });

  it("hits the defined zoom stops exactly", () => {
    expect(computeAppZoom(2560)).toBe(1.2);
    expect(computeAppZoom(3440)).toBe(1.35);
  });

  it("interpolates between stops and caps beyond the widest", () => {
    const mid = computeAppZoom(2240); // halfway 1920→2560
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(1.2);
    expect(computeAppZoom(3840)).toBe(1.35);
    expect(computeAppZoom(5120)).toBe(1.35);
  });

  it("is resilient to non-finite input", () => {
    expect(computeAppZoom(Number.NaN)).toBe(1);
  });
});
