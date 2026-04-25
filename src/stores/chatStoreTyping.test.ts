import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chatStore";
import { selectCurrentTypingStatusFromState } from "./chatStoreTyping";

describe("chatStore typing capability", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("clears typing statuses for a single conversation without touching others", () => {
    useChatStore.getState().setTyping({
      conversationId: "room-1",
      userId: "user-a",
      userName: "Alice",
      isTyping: true,
      activity: "typing",
    });
    useChatStore.getState().setTyping({
      conversationId: "room-1",
      userId: "user-b",
      userName: "Bob",
      isTyping: true,
      activity: "uploading",
    });
    useChatStore.getState().setTyping({
      conversationId: "room-2",
      userId: "user-c",
      userName: "Carol",
      isTyping: true,
      activity: "typing",
    });

    useChatStore.getState().clearConversationTypingStatuses("room-1");

    expect(useChatStore.getState().typingStatuses).toEqual([
      expect.objectContaining({
        conversationId: "room-2",
        userId: "user-c",
      }),
    ]);
  });

  it("selects the highest-priority active typing status for the selected conversation", () => {
    const typingStatus = selectCurrentTypingStatusFromState({
      selectedConversationId: "room-1",
      typingStatuses: [
        {
          conversationId: "room-1",
          userId: "user-a",
          userName: "Alice",
          isTyping: true,
          activity: "typing",
          confidence: 0.9,
        },
        {
          conversationId: "room-1",
          userId: "user-b",
          userName: "Bob",
          isTyping: true,
          activity: "recording",
          confidence: 0.2,
        },
        {
          conversationId: "room-2",
          userId: "user-c",
          userName: "Carol",
          isTyping: true,
          activity: "uploading",
          confidence: 1,
        },
      ],
    });

    expect(typingStatus).toEqual(
      expect.objectContaining({
        conversationId: "room-1",
        userId: "user-b",
        activity: "recording",
      }),
    );
  });
});
