import { describe, expect, it } from "vitest";
import type { CloudQuota } from "../types";
import { QUOTA_WARNING_RATIO, shouldPromptQuotaRequest } from "./cloudQuota";

const quota = (overrides: Partial<CloudQuota> = {}): CloudQuota => ({
  limitBytes: 5_000,
  usedBytes: 2_000,
  activeBytes: 2_000,
  trashBytes: 0,
  reservedBytes: 0,
  availableBytes: 3_000,
  updatedAt: "2026-08-06T00:00:00Z",
  ...overrides,
});
describe("shouldPromptQuotaRequest", () => {
  it("does not show an action while the drive has comfortable headroom", () => {
    expect(shouldPromptQuotaRequest(quota(), null)).toBe(false);
  });

  it("shows the action at the configured near-limit threshold", () => {
    expect(
      shouldPromptQuotaRequest(
        quota({ usedBytes: 4_000, activeBytes: 4_000, availableBytes: 1_000 }),
        null,
      ),
    ).toBe(true);
    expect(QUOTA_WARNING_RATIO).toBe(0.8);
  });

  it("includes reserved upload bytes in the near-limit decision", () => {
    expect(
      shouldPromptQuotaRequest(
        quota({ usedBytes: 3_500, activeBytes: 3_500, reservedBytes: 600, availableBytes: 1_500 }),
        null,
      ),
    ).toBe(true);
  });

  it("does not offer a duplicate request while one is pending", () => {
    expect(
      shouldPromptQuotaRequest(
        quota({ usedBytes: 4_500, activeBytes: 4_500, availableBytes: 500 }),
        {
          id: "request-1",
          status: "pending",
          currentQuotaBytes: 5_000,
          requestedQuotaBytes: 10_000,
          createdAt: "2026-08-06T00:00:00Z",
          updatedAt: "2026-08-06T00:00:00Z",
        },
      ),
    ).toBe(false);
  });

  it("shows the action immediately when no bytes remain", () => {
    expect(
      shouldPromptQuotaRequest(
        quota({ usedBytes: 5_000, activeBytes: 5_000, availableBytes: 0 }),
        null,
      ),
    ).toBe(true);
  });
});
