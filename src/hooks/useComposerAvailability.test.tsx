import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import i18n from "../i18n";
import { RoomType } from "../types";
import { useComposerAvailability } from "./useComposerAvailability";

const baseConversation = {
  id: "group-1",
  type: RoomType.GROUP,
  name: "Ops",
  participants: [],
  participantCount: 3,
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchived: false,
  isBlocked: false,
  updatedAt: new Date("2026-04-22T10:00:00.000Z"),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("useComposerAvailability", () => {
  it("locks the composer when the backend marks the group as admin-only", () => {
    const { result } = renderHook(
      () =>
        useComposerAvailability({
          connectionState: "connected",
          conversation: {
            ...baseConversation,
            canCurrentUserSend: false,
          },
          isConversationReady: true,
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      mode: "restricted",
      canType: false,
      canAttach: false,
      canSubmit: false,
    });
    expect(result.current.statusMessage).toContain("admin");
  });

  it("keeps the composer enabled during websocket reconnects with a compact hint", () => {
    const { result } = renderHook(
      () =>
        useComposerAvailability({
          connectionState: "reconnecting",
          conversation: baseConversation,
          isConversationReady: true,
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      mode: "reconnecting",
      canType: true,
      canAttach: true,
      canSubmit: true,
      statusTone: "warn",
    });
    expect(result.current.statusMessage).toContain("Reconnecting");
  });

  it("queues sends when the browser is offline instead of hard-blocking the composer", () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    try {
      const { result } = renderHook(
        () =>
          useComposerAvailability({
            connectionState: "disconnected",
            conversation: baseConversation,
            isConversationReady: true,
          }),
        { wrapper },
      );

      expect(result.current).toMatchObject({
        mode: "offline",
        canType: true,
        canAttach: false,
        canSubmit: true,
        statusTone: "error",
      });
      expect(result.current.statusMessage).toContain("connection is stable");
    } finally {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it("does not show a reconnect warning during initial websocket warmup", () => {
    const { result } = renderHook(
      () =>
        useComposerAvailability({
          connectionState: "connecting",
          conversation: baseConversation,
          isConversationReady: true,
        }),
      { wrapper },
    );

    expect(result.current).toMatchObject({
      mode: "online",
      canType: true,
      canAttach: true,
      canSubmit: true,
    });
    expect(result.current.statusMessage).toBeUndefined();
  });
});
