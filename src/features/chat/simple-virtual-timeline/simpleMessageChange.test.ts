import { describe, it, expect } from "vitest";
import { classifySimpleMessageChange } from "./simpleMessageChange";
import { MessageStatus, MessageType, type Message } from "../../../types";

const ME = "me";
const THEM = "them";

const mk = (id: string, senderId = THEM, clientMessageId?: string): Message =>
  ({
    id,
    clientMessageId,
    conversationId: "c1",
    senderId,
    senderName: senderId,
    type: MessageType.TEXT,
    content: id,
    timestamp: new Date(),
    createdAt: new Date(),
    status: MessageStatus.SENT,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
  }) as Message;

describe("classifySimpleMessageChange", () => {
  it("returns initial when prev is empty and next has items", () => {
    expect(classifySimpleMessageChange([], [mk("1")], ME).type).toBe("initial");
  });

  it("returns noop on identical reference", () => {
    const arr = [mk("1"), mk("2")];
    expect(classifySimpleMessageChange(arr, arr, ME).type).toBe("noop");
  });

  it("detects pure append and flags ownMessage when sender matches", () => {
    const prev = [mk("1")];
    const next = [mk("1"), mk("2", ME)];
    const result = classifySimpleMessageChange(prev, next, ME);
    expect(result.type).toBe("append");
    if (result.type === "append") {
      expect(result.ownMessage).toBe(true);
      expect(result.remoteCount).toBe(0);
      expect(result.appended).toHaveLength(1);
    }
  });

  it("detects pure append with remote senders only", () => {
    const prev = [mk("1")];
    const next = [mk("1"), mk("2", THEM), mk("3", THEM)];
    const result = classifySimpleMessageChange(prev, next, ME);
    expect(result.type).toBe("append");
    if (result.type === "append") {
      expect(result.ownMessage).toBe(false);
      expect(result.remoteCount).toBe(2);
    }
  });

  it("detects pure prepend (load older)", () => {
    const prev = [mk("3"), mk("4")];
    const next = [mk("1"), mk("2"), mk("3"), mk("4")];
    const result = classifySimpleMessageChange(prev, next, ME);
    expect(result.type).toBe("prepend");
    if (result.type === "prepend") {
      expect(result.prepended.map((m) => m.id)).toEqual(["1", "2"]);
    }
  });

  it("returns update when same set of keys but new array reference (reconcile)", () => {
    const prev = [mk("1"), mk("2")];
    const next = [mk("1"), mk("2")]; // new array, same keys
    expect(classifySimpleMessageChange(prev, next, ME).type).toBe("update");
  });

  it("treats clientMessageId-based reconcile as no-duplicate", () => {
    // optimistic message with clientMessageId 'cid-1' and temporary id 'tmp-1'.
    const optimistic = mk("tmp-1", ME, "cid-1");
    // server ack: same clientMessageId, real id.
    const reconciled = mk("real-1", ME, "cid-1");
    const prev = [optimistic];
    const next = [reconciled];
    // Stable key for both is the clientMessageId → same key → update, not append.
    const result = classifySimpleMessageChange(prev, next, ME);
    expect(result.type).toBe("update");
  });
});
