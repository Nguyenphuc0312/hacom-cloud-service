import { describe, it, expect } from "vitest";
import { MessageStatus, MessageType, type Message } from "../types";
import {
  buildTimelineItems,
  messagesHaveSameGroupingInputs,
} from "../utils/timelinePlanner";
import { tryBuildInPlaceMetadataItems } from "./useMessageGrouping";

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

const buildItems = (messages: Message[]) =>
  buildTimelineItems({
    messages,
    currentUserId: ME,
    conversationType: "group",
    groupingThresholdMs: 45_000,
    unreadMarker: null,
  });

describe("messagesHaveSameGroupingInputs", () => {
  it("is true across read/delivered/reaction-only changes (all settled)", () => {
    const base = mk(1);
    expect(
      messagesHaveSameGroupingInputs(base, {
        ...base,
        status: MessageStatus.READ,
        readAt: new Date() as unknown as Date,
      }),
    ).toBe(true);
    expect(
      messagesHaveSameGroupingInputs(base, {
        ...base,
        status: MessageStatus.DELIVERED,
      }),
    ).toBe(true);
    expect(
      messagesHaveSameGroupingInputs(base, {
        ...base,
        reactions: [{ emoji: "👍", userIds: ["u1"], count: 1 }],
      } as Message),
    ).toBe(true);
  });

  it("is false when a grouping-relevant field changes", () => {
    const base = mk(1);
    expect(
      messagesHaveSameGroupingInputs(base, { ...base, senderId: "other" }),
    ).toBe(false);
    expect(
      messagesHaveSameGroupingInputs(base, { ...base, isEdited: true }),
    ).toBe(false);
    expect(
      messagesHaveSameGroupingInputs(base, {
        ...base,
        createdAt: new Date(2024, 0, 2, 12, 0, 0),
      }),
    ).toBe(false);
    expect(
      messagesHaveSameGroupingInputs(base, {
        ...base,
        content: `${base.content} — a much longer edited body that changes weight`,
      }),
    ).toBe(false);
    // pending → settled transport bucket transition must NOT be treated in-place
    const pending = mk(2, {
      status: MessageStatus.SENDING,
      sendState: "sending",
    });
    expect(
      messagesHaveSameGroupingInputs(pending, {
        ...pending,
        status: MessageStatus.SENT,
        sendState: "sent",
      }),
    ).toBe(false);
  });
});

describe("tryBuildInPlaceMetadataItems", () => {
  const prevMessages = [mk(1), mk(2), mk(3)];
  const prevItems = buildItems(prevMessages);

  it("returns null when length differs (insert/delete)", () => {
    const next = [...prevMessages, mk(4)];
    expect(tryBuildInPlaceMetadataItems(prevMessages, prevItems, next)).toBe(
      null,
    );
  });

  it("returns null when order/identity changes at a position", () => {
    const next = [prevMessages[0], mk(99), prevMessages[2]];
    expect(tryBuildInPlaceMetadataItems(prevMessages, prevItems, next)).toBe(
      null,
    );
  });

  it("returns null when a changed message alters grouping inputs", () => {
    const next = [
      prevMessages[0],
      prevMessages[1],
      { ...prevMessages[2], isEdited: true },
    ];
    expect(tryBuildInPlaceMetadataItems(prevMessages, prevItems, next)).toBe(
      null,
    );
  });

  it("reuses the previous items array when nothing actually changed", () => {
    const next = [...prevMessages];
    expect(tryBuildInPlaceMetadataItems(prevMessages, prevItems, next)).toBe(
      prevItems,
    );
  });

  it("swaps only the changed message and preserves identity for the rest", () => {
    const changed = { ...prevMessages[1], status: MessageStatus.READ } as Message;
    const next = [prevMessages[0], changed, prevMessages[2]];

    const result = tryBuildInPlaceMetadataItems(prevMessages, prevItems, next);
    expect(result).not.toBe(null);
    expect(result).not.toBe(prevItems);
    expect(result!.length).toBe(prevItems.length);

    result!.forEach((item, index) => {
      const prevItem = prevItems[index];
      if (
        item.kind === "message" &&
        prevItem.kind === "message" &&
        item.message.id === "m2"
      ) {
        // Changed row: new object carrying the new message, structure intact.
        expect(item).not.toBe(prevItem);
        expect(item.message.status).toBe(MessageStatus.READ);
        expect(item.isGroupStart).toBe(prevItem.isGroupStart);
        expect(item.isGroupEnd).toBe(prevItem.isGroupEnd);
        expect(item.showStatus).toBe(prevItem.showStatus);
      } else {
        // Every other row keeps its exact previous identity.
        expect(item).toBe(prevItem);
      }
    });
  });
});
