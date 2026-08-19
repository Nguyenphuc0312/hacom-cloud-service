import { describe, it, expect } from "vitest";
import { MessageStatus, MessageType, type Message } from "../types";
import { buildTimelineItems } from "./timelinePlanner";

const ME = "me";

const pollEvt = (seq: number, kind: "voted" | "changed" | "created"): Message =>
  ({
    id: `s${seq}`,
    conversationId: "c1",
    senderId: "system",
    senderName: "system",
    type: MessageType.SYSTEM,
    content: `${kind} ${seq}`,
    createdAt: new Date(2024, 0, 1, 12, 0, seq),
    serverSeq: seq,
    messageSeq: seq,
    status: MessageStatus.SENT,
    sendState: "sent",
    metadata: { pollEvent: { kind, messageId: "p1", question: "Q" } },
  }) as unknown as Message;

const text = (seq: number): Message =>
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
  }) as unknown as Message;

const build = (messages: Message[]) =>
  buildTimelineItems({
    messages,
    currentUserId: ME,
    conversationType: "group",
    groupingThresholdMs: 45_000,
    unreadMarker: null,
  });

describe("timelinePlanner poll-event collapse", () => {
  it("folds a run of consecutive poll-events into one row; newest is visible", () => {
    const items = build([
      pollEvt(1, "voted"),
      pollEvt(2, "changed"),
      pollEvt(3, "voted"),
    ]);
    const systemRows = items.filter((i) => i.kind === "system");
    expect(systemRows).toHaveLength(1);
    const row = systemRows[0] as Extract<typeof systemRows[number], { kind: "system" }>;
    expect(row.message.id).toBe("s3"); // newest is the visible pill
    expect(row.collapsedMessages?.map((m) => m.id)).toEqual(["s1", "s2"]);
  });

  it("does not fold across a non-poll-event message", () => {
    const items = build([
      pollEvt(1, "voted"),
      text(2),
      pollEvt(3, "voted"),
    ]);
    const systemRows = items.filter((i) => i.kind === "system");
    expect(systemRows).toHaveLength(2);
    expect(systemRows.every((r) => !("collapsedMessages" in r && r.collapsedMessages?.length))).toBe(true);
  });
});
