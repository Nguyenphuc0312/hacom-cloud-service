import { describe, expect, it } from "vitest";
import { decideSummaryActiveDeltaSync } from "./summaryActiveDeltaReconcile";

describe("decideSummaryActiveDeltaSync", () => {
  it("syncs active conversation when summary last message is missing from cache", () => {
    expect(
      decideSummaryActiveDeltaSync({
        activeConversationId: "conv-1",
        eventConversationId: "conv-1",
        hasUsableLastMessageId: true,
        hasMessageInCache: false,
      }),
    ).toEqual({
      isActive: true,
      shouldSync: true,
      reason: "summary-last-message-missing-from-active-cache",
    });
  });

  it("does not sync active conversation when message event already populated cache", () => {
    expect(
      decideSummaryActiveDeltaSync({
        activeConversationId: "conv-1",
        eventConversationId: "conv-1",
        hasUsableLastMessageId: true,
        hasMessageInCache: true,
      }),
    ).toEqual({
      isActive: true,
      shouldSync: false,
      reason: null,
    });
  });

  it("does not fetch active messages for non-active conversation summaries", () => {
    expect(
      decideSummaryActiveDeltaSync({
        activeConversationId: "conv-1",
        eventConversationId: "conv-2",
        hasUsableLastMessageId: true,
        hasMessageInCache: false,
      }),
    ).toEqual({
      isActive: false,
      shouldSync: false,
      reason: null,
    });
  });
});
