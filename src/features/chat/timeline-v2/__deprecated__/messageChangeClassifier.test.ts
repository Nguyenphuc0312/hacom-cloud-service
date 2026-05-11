import { describe, expect, it } from "vitest";
import { classifyMessageChange } from "./messageChangeClassifier";
import { MessageStatus, MessageType, type Message } from "../../../types";

const baseMsg = (overrides: Partial<Message>): Message =>
  ({
    id: overrides.id ?? "m",
    conversationId: "c",
    senderId: overrides.senderId ?? "u-other",
    senderName: "x",
    type: MessageType.TEXT,
    content: "hello",
    timestamp: new Date(),
    createdAt: new Date(),
    status: MessageStatus.SENT,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
  }) as Message;

const ME = "me";
const THEM = "them";

describe("classifyMessageChange", () => {
  it("returns initial when previous was empty", () => {
    const next = [baseMsg({ id: "1" }), baseMsg({ id: "2" })];
    const r = classifyMessageChange([], next, { currentUserId: ME });
    expect(r.type).toBe("initial");
    expect(r.appendedKeys).toHaveLength(2);
  });

  it("returns noop when arrays are equal", () => {
    const arr = [baseMsg({ id: "1" }), baseMsg({ id: "2" })];
    const r = classifyMessageChange(arr, arr, { currentUserId: ME });
    expect(r.type).toBe("noop");
  });

  it("classifies append_remote when last new key is from another user", () => {
    const prev = [baseMsg({ id: "1" })];
    const next = [...prev, baseMsg({ id: "2", senderId: THEM })];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("append_remote");
    expect(r.appendedKeys).toEqual(["2"]);
  });

  it("classifies append_own when last new key is from currentUserId", () => {
    const prev = [baseMsg({ id: "1" })];
    const next = [...prev, baseMsg({ id: "2", senderId: ME })];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("append_own");
  });

  it("classifies prepend_older when new keys appear at the head only", () => {
    const prev = [baseMsg({ id: "10" }), baseMsg({ id: "11" })];
    const next = [
      baseMsg({ id: "8" }),
      baseMsg({ id: "9" }),
      baseMsg({ id: "10" }),
      baseMsg({ id: "11" }),
    ];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("prepend_older");
    expect(r.prependedKeys).toEqual(["8", "9"]);
  });

  it("reports both prepend and append when WS arrives during load older", () => {
    const prev = [baseMsg({ id: "10" }), baseMsg({ id: "11" })];
    const next = [
      baseMsg({ id: "8" }),
      baseMsg({ id: "10" }),
      baseMsg({ id: "11" }),
      baseMsg({ id: "12", senderId: THEM }),
    ];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    // Dominant type is the append because that may need to follow bottom.
    expect(r.type).toBe("append_remote");
    expect(r.prependedKeys).toEqual(["8"]);
    expect(r.appendedKeys).toEqual(["12"]);
  });

  it("classifies reconcile_update when an optimistic message turned `sent`", () => {
    const prev = [
      baseMsg({
        id: "temp-abc",
        clientMessageId: "abc",
        transportStatus: "optimistic",
        sendState: "sending",
      }),
    ];
    const next = [
      baseMsg({
        id: "server-99",
        clientMessageId: "abc",
        transportStatus: "synced_stream",
        sendState: "sent",
      }),
    ];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("reconcile_update");
    expect(r.reconciledKeys).toEqual(["abc"]);
    expect(r.appendedKeys).toHaveLength(0);
  });

  it("classifies reorder when same keys swap positions", () => {
    const prev = [baseMsg({ id: "1" }), baseMsg({ id: "2" })];
    const next = [baseMsg({ id: "2" }), baseMsg({ id: "1" })];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("reorder");
    expect(r.appendedKeys).toHaveLength(0);
  });

  it("classifies content_update when only content/edit/delete fields differ", () => {
    const prev = [baseMsg({ id: "1", content: "hi" })];
    const next = [baseMsg({ id: "1", content: "hi (edited)", isEdited: true })];
    const r = classifyMessageChange(prev, next, { currentUserId: ME });
    expect(r.type).toBe("content_update");
  });
});
