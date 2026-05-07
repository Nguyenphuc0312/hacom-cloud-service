import { describe, expect, it } from "vitest";

import { MessageStatus, MessageType, type Message } from "../../../types";
import {
  findMessageIdentityIndex,
  getStableMessageId,
  isTempMessageId,
  messagesShareIdentity,
  toMessageIdentityKeys,
} from "./messageIdentity";
import {
  compareMessages,
  findSortedInsertIndex,
  getMessageSequence,
  sortMessagesByCanonicalOrder,
} from "./messageOrdering";

const makeMessage = ({
  id,
  ...overrides
}: Partial<Message> & { id: string }): Message =>
  ({
    conversationId: "room-1",
    senderId: "user-1",
    senderName: "Alice",
    content: "hello",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date,
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
    id,
  }) as Message;

describe("message identity helpers", () => {
  it("normalizes stable identity keys across optimistic and server messages", () => {
    const optimistic = makeMessage({
      id: "temp-client-1",
      localId: "temp-client-1",
      stableId: "client-1",
      clientMessageId: "client-1",
    });
    const server = makeMessage({
      id: "server-1",
      stableId: "client-1",
      clientMessageId: "client-1",
    });

    expect(isTempMessageId(optimistic.id)).toBe(true);
    expect(getStableMessageId(optimistic)).toBe("client-1");
    expect(toMessageIdentityKeys(optimistic)).toEqual(
      expect.arrayContaining([
        "stable:client-1",
        "client:client-1",
        "id:temp-client-1",
        "local:temp-client-1",
      ]),
    );
    expect(messagesShareIdentity(optimistic, server)).toBe(true);
    expect(findMessageIdentityIndex([optimistic], server)).toBe(0);
  });

  it("does not collapse unrelated messages with only distinct permanent ids", () => {
    expect(
      messagesShareIdentity(
        makeMessage({ id: "server-a" }),
        makeMessage({ id: "server-b" }),
      ),
    ).toBe(false);
  });
});

describe("message ordering helpers", () => {
  it("uses serverSeq/messageSeq before timestamps and local ordering", () => {
    const laterCreatedButLowerSeq = makeMessage({
      id: "seq-1",
      serverSeq: 1,
      createdAt: "2026-01-01T00:05:00.000Z" as unknown as Date,
    });
    const earlierCreatedButHigherSeq = makeMessage({
      id: "seq-2",
      serverSeq: 2,
      createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date,
    });

    expect(getMessageSequence(laterCreatedButLowerSeq)).toBe(1);
    expect(
      compareMessages(laterCreatedButLowerSeq, earlierCreatedButHigherSeq),
    ).toBeLessThan(0);
    expect(
      sortMessagesByCanonicalOrder([
        earlierCreatedButHigherSeq,
        laterCreatedButLowerSeq,
      ]).map((message) => message.id),
    ).toEqual(["seq-1", "seq-2"]);
  });

  it("keeps optimistic messages after sequenced server rows and inserts by canonical order", () => {
    const messages = [
      makeMessage({ id: "server-1", serverSeq: 1 }),
      makeMessage({ id: "server-3", serverSeq: 3 }),
      makeMessage({
        id: "temp-client",
        localOrder: 10,
        createdAt: "2026-01-01T00:10:00.000Z" as unknown as Date,
      }),
    ];
    const incoming = makeMessage({ id: "server-2", serverSeq: 2 });

    expect(findSortedInsertIndex(messages, incoming)).toBe(1);
  });
});
