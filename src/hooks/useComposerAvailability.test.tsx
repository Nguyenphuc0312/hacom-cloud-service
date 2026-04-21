import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import i18n from "../i18n";
import { RoomType } from "../types";
import { useComposerAvailability } from "./useComposerAvailability";

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
});
