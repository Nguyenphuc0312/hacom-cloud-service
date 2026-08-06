/**
 * Friendship messaging policy (Option B) — adapter contract tests.
 * `normalizeConversation` must preserve the backend `sendRestriction`
 * payload (including explicit null) and reject malformed values.
 */
import { describe, expect, it } from "vitest";
import { normalizeConversation } from "./conversationAdapter";

const basePayload = {
  id: "conv-1",
  type: "direct",
  participants: [],
  updatedAt: "2026-05-01T09:00:00.000Z",
};

describe("conversationAdapter — sendRestriction parsing", () => {
  it("preserves PERSONAL_CLOUD instead of coercing it to a group", () => {
    const conversation = normalizeConversation({
      ...basePayload,
      type: "personal_cloud",
    });

    expect(conversation?.type).toBe("personal_cloud");
  });

  it("parses a FRIENDSHIP_REQUIRED restriction with UNFRIENDED reason", () => {
    const conversation = normalizeConversation({
      ...basePayload,
      canCurrentUserSend: false,
      sendRestriction: { code: "FRIENDSHIP_REQUIRED", reason: "UNFRIENDED" },
    });

    expect(conversation?.canCurrentUserSend).toBe(false);
    expect(conversation?.sendRestriction).toEqual({
      code: "FRIENDSHIP_REQUIRED",
      reason: "UNFRIENDED",
    });
  });

  it("preserves explicit null so re-friending re-enables the composer", () => {
    const conversation = normalizeConversation({
      ...basePayload,
      canCurrentUserSend: true,
      sendRestriction: null,
    });

    expect(conversation?.canCurrentUserSend).toBe(true);
    expect(conversation?.sendRestriction).toBeNull();
  });

  it("omits the field when the payload does not include it", () => {
    const conversation = normalizeConversation(basePayload);

    expect(conversation).not.toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(conversation, "sendRestriction"),
    ).toBe(false);
  });

  it("collapses malformed restriction objects to null instead of trusting them", () => {
    const conversation = normalizeConversation({
      ...basePayload,
      sendRestriction: { code: "SOMETHING_ELSE" },
    });

    expect(conversation?.sendRestriction).toBeNull();
  });
});
