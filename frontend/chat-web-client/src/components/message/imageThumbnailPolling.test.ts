import { describe, expect, it } from "vitest";

import {
  getMaxAutoThumbnailPollAttempts,
  getThumbnailPollDelayMs,
  shouldContinueThumbnailPolling,
} from "./imageThumbnailPolling";

describe("imageThumbnailPolling", () => {
  it("uses 5s polls for the first 6 attempts and 15s after", () => {
    expect(getThumbnailPollDelayMs(0, null)).toBe(5000);
    expect(getThumbnailPollDelayMs(5, null)).toBe(5000);
    expect(getThumbnailPollDelayMs(6, null)).toBe(15000);
    expect(getThumbnailPollDelayMs(9, null)).toBe(15000);
  });

  it("clamps server retry hints to the current polling phase", () => {
    expect(getThumbnailPollDelayMs(0, 500)).toBe(2000);
    expect(getThumbnailPollDelayMs(0, 12000)).toBe(5000);
    expect(getThumbnailPollDelayMs(8, 30000)).toBe(15000);
  });

  it("stops automatic polling after the configured attempt budget", () => {
    const maxAttempts = getMaxAutoThumbnailPollAttempts();
    expect(shouldContinueThumbnailPolling(maxAttempts - 1)).toBe(true);
    expect(shouldContinueThumbnailPolling(maxAttempts)).toBe(false);
  });
});
