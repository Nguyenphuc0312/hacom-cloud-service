/**
 * Friendship messaging policy (Option B) — composer gating tests.
 * The composer state must derive from the backend conversation payload
 * (canCurrentUserSend + sendRestriction), so it survives a page reload.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useComposerAvailability } from "./useComposerAvailability";
import type { Conversation } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (typeof options?.defaultValue === "string" && options.defaultValue) || key,
  }),
}));

const baseConversation = {
  id: "conv-1",
  type: "direct",
  name: null,
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchived: false,
  isBlocked: false,
  participantCount: 2,
  updatedAt: new Date("2026-05-01T09:00:00.000Z"),
} as unknown as Conversation;

describe("useComposerAvailability — DM friendship restriction", () => {
  it("locks the composer with the unfriended banner when sendRestriction reason is UNFRIENDED", () => {
    const { result } = renderHook(() =>
      useComposerAvailability({
        connectionState: "connected",
        conversation: {
          ...baseConversation,
          canCurrentUserSend: false,
          sendRestriction: { code: "FRIENDSHIP_REQUIRED", reason: "UNFRIENDED" },
        },
      }),
    );

    expect(result.current.mode).toBe("restricted");
    expect(result.current.canType).toBe(false);
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.statusTone).toBe("error");
    expect(result.current.statusMessage).toBe(
      "You are no longer friends. Add this person as a friend again to continue messaging.",
    );
  });

  it("locks the composer with the friendship-required banner when there is no UNFRIENDED reason", () => {
    const { result } = renderHook(() =>
      useComposerAvailability({
        connectionState: "connected",
        conversation: {
          ...baseConversation,
          canCurrentUserSend: false,
          sendRestriction: { code: "FRIENDSHIP_REQUIRED" },
        },
      }),
    );

    expect(result.current.mode).toBe("restricted");
    expect(result.current.statusMessage).toBe(
      "You can only message friends. Send a friend request to start the conversation.",
    );
  });

  it("keeps the group read-only message for non-friendship restrictions", () => {
    const { result } = renderHook(() =>
      useComposerAvailability({
        connectionState: "connected",
        conversation: {
          ...baseConversation,
          type: "group",
          canCurrentUserSend: false,
          sendRestriction: null,
        } as unknown as Conversation,
      }),
    );

    expect(result.current.mode).toBe("restricted");
    expect(result.current.statusMessage).toBe(
      "Only group admins can send messages right now.",
    );
  });

  it("allows sending when the backend reports the friendship as accepted", () => {
    const { result } = renderHook(() =>
      useComposerAvailability({
        connectionState: "connected",
        conversation: {
          ...baseConversation,
          canCurrentUserSend: true,
          sendRestriction: null,
        },
      }),
    );

    expect(result.current.mode).toBe("online");
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.statusMessage).toBeUndefined();
  });
});
