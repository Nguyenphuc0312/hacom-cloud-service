import { describe, it, expect } from "vitest";
import { MessageStatus, MessageType, type Message } from "../types";
import { buildTimelineItems } from "./timelinePlanner";

const ME = "me";

const text = (seq: number, overrides: Partial<Message> = {}): Message =>
  ({
    id: `m${seq}`,
    conversationId: "c1",
    senderId: ME,
    senderName: ME,
    type: MessageType.TEXT,
    content: `msg ${seq}`,
    createdAt: new Date(2024, 0, 1, 12, 0, seq),
    serverSeq: seq,
    messageSeq: seq,
    status: MessageStatus.SENT,
    sendState: "sent",
    ...overrides,
  }) as unknown as Message;

const build = (messages: Message[]) =>
  buildTimelineItems({
    messages,
    currentUserId: ME,
    conversationType: "group",
    groupingThresholdMs: 45_000,
    unreadMarker: null,
  });

const messageRows = (messages: Message[]) =>
  build(messages).filter((item) => item.kind === "message");

describe("timelinePlanner edited-message meta", () => {
  it("shows meta on an edited message even when it sits mid-cluster", () => {
    const rows = messageRows([
      text(1, { isEdited: true, editedAt: new Date(2024, 0, 1, 12, 5) }),
      text(2),
      text(3),
    ]);

    expect(rows).toHaveLength(3);
    // tin 1 nằm giữa cụm (không phải groupEnd) nhưng đã sửa → vẫn phải có nhãn
    expect(rows[0]).toMatchObject({ isGroupEnd: false, showMeta: true });
    // các tin không sửa vẫn gộp như cũ
    expect(rows[1]).toMatchObject({ isGroupEnd: false, showMeta: false });
    expect(rows[2]).toMatchObject({ isGroupEnd: true, showMeta: true });
  });

  it("does not mark unedited neighbours as edited", () => {
    const rows = messageRows([
      text(1, { isEdited: true, editedAt: new Date(2024, 0, 1, 12, 5) }),
      text(2),
      text(3),
    ]);

    expect(rows.map((row) => Boolean(row.message.isEdited))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps read/sent status collapsed to the end of the cluster", () => {
    const rows = messageRows([
      text(1, { isEdited: true, editedAt: new Date(2024, 0, 1, 12, 5) }),
      text(2),
    ]);

    expect(rows[0].showStatus).toBe(false);
    expect(rows[1].showStatus).toBe(true);
  });
});
