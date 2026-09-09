import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFileLifecycleTelemetryEnabled,
  isInAppFileViewerEnabled,
} from "./fileViewerRollout";

describe("fileViewerRollout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed unless each build flag is exactly true", () => {
    vi.stubEnv("VITE_FILE_VIEWER_ENABLED", "TRUE");
    vi.stubEnv("VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED", "1");

    expect(isInAppFileViewerEnabled()).toBe(false);
    expect(isFileLifecycleTelemetryEnabled()).toBe(false);

    vi.stubEnv("VITE_FILE_VIEWER_ENABLED", "true");
    vi.stubEnv("VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED", "true");

    expect(isInAppFileViewerEnabled()).toBe(true);
    expect(isFileLifecycleTelemetryEnabled()).toBe(true);
  });
});
