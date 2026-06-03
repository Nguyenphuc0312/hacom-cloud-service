import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MessageStatus, MessageType, type Message } from "../../../types";
import {
  useConversationTimelineRows,
  type ConversationTimelineItem,
} from "./useConversationTimelineRows";

const ME = "me";

const mk = (seq: number, overrides: Partial<Message> = {}): Message =>
  ({
    id: `m${seq}`,
    conversationId: "c1",
    senderId: ME,
    senderName: ME,
    type: MessageType.TEXT,
    content: `msg ${seq}`,
    timestamp: new Date(2024, 0, 1, 12, 0, seq),
    createdAt: new Date(2024, 0, 1, 12, 0, seq),
    serverSeq: seq,
    messageSeq: seq,
    status: MessageStatus.SENT,
    sendState: "sent",
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
  }) as Message;

const messageItemFor = (
  items: ConversationTimelineItem[],
  id: string,
): ConversationTimelineItem | undefined =>
  items.find((item) => item.kind === "message" && item.messageId === id);

const renderRows = (initial: Message[]) =>
  renderHook(
    ({ messages }: { messages: Message[] }) =>
      useConversationTimelineRows({
        messages,
        currentUserId: ME,
        conversationType: "group",
        unreadMarker: null,
      }),
    { initialProps: { messages: initial } },
  );

describe("useConversationTimelineRows in-place metadata path", () => {
  it("preserves row identity for unchanged messages on a metadata update", () => {
    const m1 = mk(1);
    const m2 = mk(2);
    const m3 = mk(3);

    const { result, rerender } = renderRows([m1, m2, m3]);
    const before = result.current;
    const beforeM1 = messageItemFor(before, "m1");
    const beforeM3 = messageItemFor(before, "m3");

    // Read receipt on m2 only: new object for m2, m1/m3 keep their references.
    const m2Read = { ...m2, status: MessageStatus.READ } as Message;
    rerender({ messages: [m1, m2Read, m3] });
    const after = result.current;

    expect(after.length).toBe(before.length);
    // Untouched rows keep their exact identity → no re-render downstream.
    expect(messageItemFor(after, "m1")).toBe(beforeM1);
    expect(messageItemFor(after, "m3")).toBe(beforeM3);
    // The changed row is a fresh object carrying the updated message.
    const afterM2 = messageItemFor(after, "m2");
    expect(afterM2).not.toBe(messageItemFor(before, "m2"));
    expect(afterM2?.kind === "message" && afterM2.message.status).toBe(
      MessageStatus.READ,
    );
  });

  it("returns a stable array when an unrelated re-render produces an equal list", () => {
    const m1 = mk(1);
    const m2 = mk(2);

    const { result, rerender } = renderRows([m1, m2]);
    const before = result.current;

    // New array, identical element references (e.g. a no-op Immer produce).
    rerender({ messages: [m1, m2] });
    expect(result.current).toBe(before);
  });

  it("falls back to a correct full rebuild when a message is inserted", () => {
    const m1 = mk(1);
    const m3 = mk(3);

    const { result, rerender } = renderRows([m1, m3]);
    const m2 = mk(2);
    rerender({ messages: [m1, m2, m3] });

    const ids = result.current
      .filter((item) => item.kind === "message")
      .map((item) => (item.kind === "message" ? item.messageId : ""));
    expect(ids).toEqual(["m1", "m2", "m3"]);
  });
});
