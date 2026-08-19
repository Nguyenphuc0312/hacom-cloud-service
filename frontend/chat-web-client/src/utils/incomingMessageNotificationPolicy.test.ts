import { describe, expect, it } from "vitest";
import {
  decideIncomingMessageNotification,
  normalizeMentionUserIds,
  type IncomingMessageNotificationContext,
} from "./incomingMessageNotificationPolicy";

const baseContext = (
  overrides: Partial<IncomingMessageNotificationContext> = {},
): IncomingMessageNotificationContext => ({
  senderId: "user-b",
  currentUserId: "user-a",
  notificationsEnabled: true,
  isMuted: false,
  hasMention: false,
  isInMessageModule: true,
  visibleAndFocused: false,
  ...overrides,
});

describe("decideIncomingMessageNotification", () => {
  it("emits browser notification for a hidden and unfocused incoming message", () => {
    expect(decideIncomingMessageNotification(baseContext())).toEqual({
      emitBrowserNotification: true,
      showInAppToast: false,
      upsertNotificationStore: true,
      bailReason: null,
    });
  });

  it("does not notify for self messages", () => {
    expect(
      decideIncomingMessageNotification(
        baseContext({ senderId: "user-a" }),
      ).bailReason,
    ).toBe("self_message");
  });

  it("does not notify when notifications are disabled", () => {
    expect(
      decideIncomingMessageNotification(
        baseContext({ notificationsEnabled: false }),
      ).bailReason,
    ).toBe("notifications_disabled");
  });

  it("does not notify muted conversations without a mention", () => {
    expect(
      decideIncomingMessageNotification(baseContext({ isMuted: true }))
        .bailReason,
    ).toBe("muted");
  });

  it("emits for muted conversations when the current user is mentioned", () => {
    const decision = decideIncomingMessageNotification(
      baseContext({ isMuted: true, hasMention: true }),
    );

    expect(decision.bailReason).toBeNull();
    expect(decision.emitBrowserNotification).toBe(true);
  });

  it("does not emit browser notification when the document is visible and focused", () => {
    const decision = decideIncomingMessageNotification(
      baseContext({ visibleAndFocused: true }),
    );

    expect(decision.emitBrowserNotification).toBe(false);
    expect(decision.showInAppToast).toBe(false);
  });

  it("treats a missing conversation as not muted when caller passes false", () => {
    const decision = decideIncomingMessageNotification(
      baseContext({ isMuted: false }),
    );

    expect(decision.bailReason).toBeNull();
    expect(decision.emitBrowserNotification).toBe(true);
  });
});

describe("normalizeMentionUserIds", () => {
  it("normalizes string and object mention payloads to user ids", () => {
    expect(
      normalizeMentionUserIds([
        "user-a",
        { userId: "user-b", displayName: "User B" },
        { id: "not-used" },
        "",
        null,
      ]),
    ).toEqual(["user-a", "user-b"]);
  });
});
