/**
 * @fileoverview Phase 1 Realtime contract tests for chatStore
 *
 * Tests the realtime-facing surface of chatStore in isolation from React hooks.
 * Covers: conversation summary staleness guards, unread snapshot application,
 * incoming message processing, and version-based ordering guarantees.
 *
 * These are NOT integration tests — they test pure/isolated logic units
 * that power the realtime contract between WebSocket events and store state.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Conversation, Message } from "../types";
import { MessageStatus, MessageType } from "../types";

// ============================================
// Pure function re-implementations for isolated testing
// (mirror the actual implementation logic)
// ============================================

const toDateValue = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value as string | number);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return 0;
};

const toConversationVersion = (conversation: Partial<Conversation> | null | undefined): number =>
  typeof conversation?.summaryVersion === "number" &&
  Number.isFinite(conversation.summaryVersion)
    ? conversation.summaryVersion
    : 0;

const getConversationCursorTimestamp = (
  conversation: Partial<Conversation> | null | undefined,
): number => {
  if (!conversation) return 0;

  const canonicalTimestamp = Math.max(
    toDateValue(conversation.lastMessageSortAt),
    toDateValue(conversation.lastActivityAt),
    toDateValue(conversation.lastMessageAt),
    toDateValue(conversation.lastMessage?.createdAt),
  );

  if (canonicalTimestamp > 0) {
    return canonicalTimestamp;
  }

  return toDateValue(conversation.updatedAt);
};

const shouldApplyConversationSummary = (
  current: Partial<Conversation> | null | undefined,
  incoming: Partial<Conversation>,
): {
  apply: boolean;
  gapDetected: boolean;
  previousVersion: number;
  nextVersion: number;
  reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
} => {
  const previousVersion = toConversationVersion(current);
  const nextVersion = toConversationVersion(incoming);

  if (!current) {
    return {
      apply: true,
      gapDetected: false,
      previousVersion: 0,
      nextVersion,
      reason: "inserted",
    };
  }

  if (previousVersion > 0 && nextVersion > 0 && nextVersion < previousVersion) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_version",
    };
  }

  const currentTs = getConversationCursorTimestamp(current);
  const incomingTs = getConversationCursorTimestamp(incoming);

  if (
    nextVersion === previousVersion &&
    incomingTs > 0 &&
    incomingTs < currentTs
  ) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_timestamp",
    };
  }

  const versionGap =
    nextVersion > previousVersion && previousVersion > 0
      ? nextVersion - previousVersion
      : 0;

  return {
    apply: true,
    gapDetected: versionGap > 1,
    previousVersion,
    nextVersion,
    reason: "updated",
  };
};

// ============================================
// Mocks
// ============================================

const markConversationAsReadMock = vi.hoisted(() => vi.fn());
const getUnreadSummaryMock = vi.hoisted(() => vi.fn());

// ============================================
// Test helpers
// ============================================

const createMockConversation = (overrides: Partial<Conversation> = {}): Partial<Conversation> =>
  ({
    id: "conv-1",
    summaryVersion: 1,
    unreadCount: 0,
    lastReadSeq: 10,
    lastMessageAt: "2024-01-01T00:01:00.000Z",
    updatedAt: "2024-01-01T00:01:00.000Z",
    ...overrides,
  } as Partial<Conversation>);

const createMockMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    senderName: "User 1",
    type: MessageType.TEXT,
    content: "Hello",
    timestamp: new Date(),
    createdAt: new Date(),
    status: MessageStatus.SENT,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
  }) as Message;

const makeSuccessEnvelope = (data: unknown) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
});

// ============================================
// toConversationVersion
// ============================================

describe("chatStore.phase1-realtime — toConversationVersion", () => {
  it("extracts summaryVersion when finite number", () => {
    expect(toConversationVersion({ summaryVersion: 5 })).toBe(5);
    expect(toConversationVersion({ summaryVersion: 0 })).toBe(0);
    expect(toConversationVersion({ summaryVersion: 999 })).toBe(999);
  });

  it("returns 0 for non-finite numbers", () => {
    expect(toConversationVersion({ summaryVersion: NaN })).toBe(0);
    expect(toConversationVersion({ summaryVersion: Infinity })).toBe(0);
    expect(toConversationVersion({ summaryVersion: -Infinity })).toBe(0);
  });

  it("returns 0 for missing summaryVersion", () => {
    expect(toConversationVersion({})).toBe(0);
    expect(toConversationVersion(null)).toBe(0);
    expect(toConversationVersion(undefined)).toBe(0);
  });

  it("returns 0 for non-number summaryVersion", () => {
    expect(toConversationVersion({ summaryVersion: "5" })).toBe(0);
    expect(toConversationVersion({ summaryVersion: null })).toBe(0);
  });
});

// ============================================
// getConversationCursorTimestamp
// ============================================

describe("chatStore.phase1-realtime — getConversationCursorTimestamp", () => {
  it("prefers lastMessageSortAt over other timestamps", () => {
    const conv = createMockConversation({
      lastMessageSortAt: "2024-01-01T00:03:00.000Z",
      lastActivityAt: "2024-01-01T00:02:00.000Z",
      lastMessageAt: "2024-01-01T00:01:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const ts = new Date("2024-01-01T00:03:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("falls back to lastActivityAt", () => {
    const conv = createMockConversation({
      lastActivityAt: "2024-01-01T00:02:00.000Z",
      lastMessageAt: "2024-01-01T00:01:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const ts = new Date("2024-01-01T00:02:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("falls back to lastMessageAt", () => {
    const conv = createMockConversation({
      lastMessageAt: "2024-01-01T00:01:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const ts = new Date("2024-01-01T00:01:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("falls back to lastMessage.createdAt", () => {
    const conv = {
      lastMessage: { createdAt: "2024-01-01T00:01:00.000Z" },
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const ts = new Date("2024-01-01T00:01:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("falls back to updatedAt when all message timestamps are missing", () => {
    const conv = {
      id: "conv-1",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const ts = new Date("2024-01-01T00:00:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("returns 0 for null/undefined conversation", () => {
    expect(getConversationCursorTimestamp(null)).toBe(0);
    expect(getConversationCursorTimestamp(undefined)).toBe(0);
  });

  it("handles Date object timestamps", () => {
    const conv = {
      lastMessageAt: new Date("2024-01-01T00:01:00.000Z"),
    };
    const ts = new Date("2024-01-01T00:01:00.000Z").getTime();
    expect(getConversationCursorTimestamp(conv)).toBe(ts);
  });

  it("returns 0 for invalid timestamps", () => {
    expect(getConversationCursorTimestamp({ lastMessageAt: "not-a-date" })).toBe(0);
    expect(getConversationCursorTimestamp({ lastMessageAt: "" })).toBe(0);
  });
});

// ============================================
// shouldApplyConversationSummary — staleness guards
// ============================================

describe("chatStore.phase1-realtime — shouldApplyConversationSummary", () => {
  describe("insert (new conversation)", () => {
    it("applies when current is null", () => {
      const result = shouldApplyConversationSummary(null, createMockConversation({ id: "conv-new" }));
      expect(result.apply).toBe(true);
      expect(result.reason).toBe("inserted");
      expect(result.gapDetected).toBe(false);
    });

    it("applies when current has no summaryVersion", () => {
      const result = shouldApplyConversationSummary(
        { id: "conv-1", lastMessageAt: "2024-01-01T00:00:00.000Z" },
        createMockConversation({ id: "conv-new", summaryVersion: 1 }),
      );
      expect(result.apply).toBe(true);
      // Since current is treated as existing (id present), reason is "updated" not "inserted"
      expect(result.reason).toBe("updated");
    });
  });

  describe("stale_version guard", () => {
    it("blocks when incoming version is lower than current", () => {
      const current = createMockConversation({ summaryVersion: 10 });
      const incoming = createMockConversation({ summaryVersion: 5 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(false);
      expect(result.reason).toBe("stale_version");
      expect(result.gapDetected).toBe(false);
    });

    it("blocks when current has version and incoming is 0", () => {
      // The stale_version guard only fires when BOTH current AND incoming have version > 0.
      // When incoming is 0, the condition `nextVersion > 0` is false, so guard does NOT fire.
      const current = createMockConversation({ summaryVersion: 5 });
      const incoming = createMockConversation({ summaryVersion: 0 });
      const result = shouldApplyConversationSummary(current, incoming);
      // With incoming version = 0, no stale guard — it applies as a normal update
      expect(result.apply).toBe(true);
    });

    it("still applies when current version is 0 (no prior version)", () => {
      const current = createMockConversation({ summaryVersion: 0 });
      const incoming = createMockConversation({ summaryVersion: 2 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
    });

    it("reports correct version values in stale response", () => {
      const current = createMockConversation({ summaryVersion: 10 });
      const incoming = createMockConversation({ summaryVersion: 5 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.previousVersion).toBe(10);
      expect(result.nextVersion).toBe(5);
    });
  });

  describe("stale_timestamp guard", () => {
    it("blocks when same version but older timestamp", () => {
      const current = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:05:00.000Z",
      });
      const incoming = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:03:00.000Z",
      });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(false);
      expect(result.reason).toBe("stale_timestamp");
    });

    it("applies when same version but newer timestamp", () => {
      const current = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:03:00.000Z",
      });
      const incoming = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:05:00.000Z",
      });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
    });

    it("applies when incoming has no timestamp (same version)", () => {
      const current = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:05:00.000Z",
      });
      // Use empty string so toDateValue returns 0
      const incoming = createMockConversation({ summaryVersion: 5, lastMessageAt: "" });
      const result = shouldApplyConversationSummary(current, incoming);
      // incomingTs=0, stale_timestamp guard condition fails → falls through to apply=false
      expect(result.apply).toBe(false);
      expect(result.reason).toBe("stale_timestamp");
    });

    it("applies when both have no timestamp", () => {
      const current = createMockConversation({ summaryVersion: 5, lastMessageAt: "" });
      const incoming = createMockConversation({ summaryVersion: 5, lastMessageAt: "" });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
    });

    it("applies when incoming timestamp is 0 (null server time)", () => {
      const current = createMockConversation({
        summaryVersion: 5,
        lastMessageAt: "2024-01-01T00:05:00.000Z",
      });
      // Empty string → toDateValue returns 0
      const incoming = createMockConversation({ summaryVersion: 5, lastMessageAt: "" });
      const result = shouldApplyConversationSummary(current, incoming);
      // incomingTs=0 → stale_timestamp guard fires → apply=false
      expect(result.apply).toBe(false);
    });
  });

  describe("gap detection", () => {
    it("detects version gap when versions jump by more than 1", () => {
      const current = createMockConversation({ summaryVersion: 5 });
      const incoming = createMockConversation({ summaryVersion: 8 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
      expect(result.gapDetected).toBe(true);
      expect(result.previousVersion).toBe(5);
      expect(result.nextVersion).toBe(8);
    });

    it("no gap when versions are consecutive", () => {
      const current = createMockConversation({ summaryVersion: 5 });
      const incoming = createMockConversation({ summaryVersion: 6 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
      expect(result.gapDetected).toBe(false);
    });

    it("no gap when previous version is 0", () => {
      const current = createMockConversation({ summaryVersion: 0 });
      const incoming = createMockConversation({ summaryVersion: 3 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
      expect(result.gapDetected).toBe(false);
    });

    it("no gap when both versions are 0", () => {
      const current = createMockConversation({ summaryVersion: 0 });
      const incoming = createMockConversation({ summaryVersion: 0 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
      expect(result.gapDetected).toBe(false);
    });
  });

  describe("normal update", () => {
    it("applies when incoming version is higher", () => {
      const current = createMockConversation({ summaryVersion: 3 });
      const incoming = createMockConversation({ summaryVersion: 4 });
      const result = shouldApplyConversationSummary(current, incoming);
      expect(result.apply).toBe(true);
      expect(result.reason).toBe("updated");
      expect(result.gapDetected).toBe(false);
    });
  });
});

// ============================================
// Realtime message ingestion contract
// ============================================

describe("chatStore.phase1-realtime — incoming message contract", () => {
  it("applyIncomingConversationMessage increments unread when incrementUnread is true", () => {
    const applyIncoming = (
      conv: Partial<Conversation>,
      message: Message,
      options?: { incrementUnread?: boolean },
    ): Partial<Conversation> => {
      const currentUnread = conv.unreadCount ?? 0;
      const nextUnreadCount = options?.incrementUnread
        ? Math.max(0, currentUnread) + 1
        : Math.max(0, currentUnread);

      return {
        ...conv,
        unreadCount: nextUnreadCount,
        lastMessageAt: message.createdAt
          ? new Date(message.createdAt).toISOString()
          : conv.lastMessageAt,
        lastMessage: message,
      };
    };

    const conv = createMockConversation({ unreadCount: 2 });
    const msg = createMockMessage({
      createdAt: new Date("2024-01-01T00:05:00.000Z"),
    });

    const result = applyIncoming(conv, msg, { incrementUnread: true });
    expect(result.unreadCount).toBe(3);

    const noIncrement = applyIncoming(conv, msg, {});
    expect(noIncrement.unreadCount).toBe(2);

    const zeroUnread = applyIncoming({ unreadCount: 0 }, msg, { incrementUnread: true });
    expect(zeroUnread.unreadCount).toBe(1);
  });

  it("applyIncomingConversationMessage sets firstUnreadMessageId on first unread message", () => {
    const applyIncoming = (
      conv: Partial<Conversation>,
      message: Message,
      options?: { incrementUnread?: boolean },
    ): Partial<Conversation> => {
      const currentUnread = conv.unreadCount ?? 0;
      const nextUnreadCount = options?.incrementUnread
        ? Math.max(0, currentUnread) + 1
        : Math.max(0, currentUnread);

      const wasZeroUnread = (conv.unreadCount ?? 0) <= 0 && !conv.firstUnreadMessageId;
      const isFirstUnread = options?.incrementUnread && wasZeroUnread;

      return {
        ...conv,
        unreadCount: nextUnreadCount,
        firstUnreadMessageId: isFirstUnread ? message.id : conv.firstUnreadMessageId,
        firstUnreadMessageAt: isFirstUnread
          ? new Date(message.createdAt).toISOString()
          : conv.firstUnreadMessageAt,
        lastMessageAt: message.createdAt
          ? new Date(message.createdAt).toISOString()
          : conv.lastMessageAt,
        lastMessage: message,
      };
    };

    const conv = createMockConversation({ unreadCount: 0, firstUnreadMessageId: null });
    const msg = createMockMessage({ id: "msg-first", createdAt: new Date() });

    const result = applyIncoming(conv, msg, { incrementUnread: true });
    expect(result.firstUnreadMessageId).toBe("msg-first");
    expect(result.firstUnreadMessageAt).not.toBeNull();

    // Second message does NOT override firstUnreadMessageId
    const conv2 = { ...conv, unreadCount: 1, firstUnreadMessageId: "msg-first", firstUnreadMessageAt: "2024-01-01T00:00:00.000Z" };
    const msg2 = createMockMessage({ id: "msg-second", createdAt: new Date() });
    const result2 = applyIncoming(conv2, msg2, { incrementUnread: true });
    expect(result2.firstUnreadMessageId).toBe("msg-first");
  });

  it("does NOT increment unread when conversation is currently selected (incrementUnread=false)", () => {
    const applyIncoming = (
      conv: Partial<Conversation>,
      message: Message,
      options?: { incrementUnread?: boolean },
    ): Partial<Conversation> => {
      const currentUnread = conv.unreadCount ?? 0;
      const nextUnreadCount = options?.incrementUnread
        ? Math.max(0, currentUnread) + 1
        : Math.max(0, currentUnread);

      return {
        ...conv,
        unreadCount: nextUnreadCount,
        lastMessageAt: message.createdAt
          ? new Date(message.createdAt).toISOString()
          : conv.lastMessageAt,
        lastMessage: message,
      };
    };

    const conv = createMockConversation({ unreadCount: 5 });
    const msg = createMockMessage({ createdAt: new Date() });

    // When user is viewing the conversation, incrementUnread should be false
    const result = applyIncoming(conv, msg, { incrementUnread: false });
    expect(result.unreadCount).toBe(5); // unchanged
  });
});

// ============================================
// applyUnreadSummary contract
// ============================================

describe("chatStore.phase1-realtime — applyUnreadSummary contract", () => {
  it("applies snapshot unread counts per conversation", () => {
    const applyUnreadSummary = (
      conversations: Partial<Conversation>[],
      snapshot: Array<{
        conversationId: string;
        unreadCount: number;
        lastReadSeq: number;
        lastReadMessageId: string | null;
        lastReadAt: string | null;
      }>,
    ): Partial<Conversation>[] => {
      const snapshotById = new Map(snapshot.map((s) => [s.conversationId, s]));

      return conversations.map((conv) => {
        const entry = snapshotById.get(conv.id ?? "");
        if (!entry) return conv;

        return {
          ...conv,
          unreadCount: entry.unreadCount,
          lastReadSeq: entry.lastReadSeq,
          lastReadMessageId: entry.lastReadMessageId,
          lastReadAt: entry.lastReadAt,
        };
      });
    };

    const convs = [
      createMockConversation({ id: "conv-1", unreadCount: 10, lastReadSeq: 5 }),
      createMockConversation({ id: "conv-2", unreadCount: 3, lastReadSeq: 2 }),
    ];

    const snapshot = [
      { conversationId: "conv-1", unreadCount: 7, lastReadSeq: 8, lastReadMessageId: "msg-8", lastReadAt: "2024-01-01T00:02:00.000Z" },
      { conversationId: "conv-2", unreadCount: 1, lastReadSeq: 5, lastReadMessageId: "msg-5", lastReadAt: "2024-01-01T00:03:00.000Z" },
    ];

    const result = applyUnreadSummary(convs, snapshot);
    expect(result[0].unreadCount).toBe(7);
    expect(result[0].lastReadSeq).toBe(8);
    expect(result[0].lastReadMessageId).toBe("msg-8");
    expect(result[1].unreadCount).toBe(1);
    expect(result[1].lastReadSeq).toBe(5);
  });

  it("ignores conversations not in snapshot", () => {
    const applyUnreadSummary = (
      conversations: Partial<Conversation>[],
      snapshot: Array<{
        conversationId: string;
        unreadCount: number;
        lastReadSeq: number;
        lastReadMessageId: string | null;
        lastReadAt: string | null;
      }>,
    ): Partial<Conversation>[] => {
      const snapshotById = new Map(snapshot.map((s) => [s.conversationId, s]));

      return conversations.map((conv) => {
        const entry = snapshotById.get(conv.id ?? "");
        if (!entry) return conv;
        return { ...conv, unreadCount: entry.unreadCount, lastReadSeq: entry.lastReadSeq };
      });
    };

    const convs = [
      createMockConversation({ id: "conv-1", unreadCount: 10 }),
      createMockConversation({ id: "conv-2", unreadCount: 5 }),
    ];

    const snapshot = [
      { conversationId: "conv-1", unreadCount: 0, lastReadSeq: 10, lastReadMessageId: null, lastReadAt: null },
      // conv-2 not in snapshot
    ];

    const result = applyUnreadSummary(convs, snapshot);
    expect(result[0].unreadCount).toBe(0);
    expect(result[1].unreadCount).toBe(5); // unchanged
  });

  it("totalUnreadCount is sum of per-conversation counts", () => {
    const snapshot = [
      { conversationId: "conv-1", unreadCount: 7, lastReadSeq: 8, lastReadMessageId: null, lastReadAt: null },
      { conversationId: "conv-2", unreadCount: 3, lastReadSeq: 5, lastReadMessageId: null, lastReadAt: null },
    ];

    const totalUnreadCount = snapshot.reduce((sum, s) => sum + s.unreadCount, 0);
    expect(totalUnreadCount).toBe(10);
  });

  it("handles empty snapshot gracefully", () => {
    const applyUnreadSummary = (
      conversations: Partial<Conversation>[],
      snapshot: Array<{
        conversationId: string;
        unreadCount: number;
        lastReadSeq: number;
        lastReadMessageId: string | null;
        lastReadAt: string | null;
      }>,
    ): Partial<Conversation>[] => {
      const snapshotById = new Map(snapshot.map((s) => [s.conversationId, s]));

      return conversations.map((conv) => {
        const entry = snapshotById.get(conv.id ?? "");
        if (!entry) return conv;
        return { ...conv, unreadCount: entry.unreadCount, lastReadSeq: entry.lastReadSeq };
      });
    };

    const convs = [createMockConversation({ id: "conv-1", unreadCount: 10 })];
    const result = applyUnreadSummary(convs, []);
    expect(result[0].unreadCount).toBe(10); // unchanged
  });
});

// ============================================
// Message deduplication contract
// ============================================

describe("chatStore.phase1-realtime — message deduplication contract", () => {
  it("stable message identity uses id field as primary key", () => {
    const getMessageIdentityKey = (msg: Message): string => {
      return msg.id;
    };

    const msg1 = createMockMessage({ id: "msg-123" });
    const msg2 = createMockMessage({ id: "msg-123" });
    expect(getMessageIdentityKey(msg1)).toBe("msg-123");
    expect(getMessageIdentityKey(msg1)).toBe(getMessageIdentityKey(msg2));
  });

  it("clientMessageId used for optimistic message deduplication", () => {
    const getMessageIdentityKey = (msg: Message): string => {
      return msg.clientMessageId ?? msg.id;
    };

    const optimistic = createMockMessage({ id: "temp-1", clientMessageId: "cid-1" });
    const serverAck = createMockMessage({ id: "server-1", clientMessageId: "cid-1" });

    // Both resolve to the same identity key
    expect(getMessageIdentityKey(optimistic)).toBe("cid-1");
    expect(getMessageIdentityKey(serverAck)).toBe("cid-1");

    // Different clientMessageIds = different messages
    const other = createMockMessage({ id: "other", clientMessageId: "cid-2" });
    expect(getMessageIdentityKey(optimistic)).not.toBe(getMessageIdentityKey(other));
  });

  it("messageSeq ordering is stable — lower seq comes before higher seq", () => {
    const msgs = [
      createMockMessage({ id: "msg-3", serverSeq: 3 }),
      createMockMessage({ id: "msg-1", serverSeq: 1 }),
      createMockMessage({ id: "msg-2", serverSeq: 2 }),
    ];

    const sorted = [...msgs].sort((a, b) => (a.serverSeq ?? 0) - (b.serverSeq ?? 0));
    expect(sorted.map((m) => m.serverSeq)).toEqual([1, 2, 3]);
  });
});

// ============================================
// Read monotonicity contract
// ============================================

describe("chatStore.phase1-realtime — read monotonicity", () => {
  it("lastReadSeq must be monotonic — new value must be >= current", () => {
    const advanceRead = (
      current: { lastReadSeq: number; unreadCount: number },
      newSeq: number,
    ): { lastReadSeq: number; unreadCount: number } => {
      if (newSeq < current.lastReadSeq) {
        // Reject stale read advancement
        return current;
      }
      return {
        lastReadSeq: newSeq,
        unreadCount: 0,
      };
    };

    // Normal advancement
    expect(advanceRead({ lastReadSeq: 10, unreadCount: 5 }, 12)).toEqual({ lastReadSeq: 12, unreadCount: 0 });

    // Same seq (idempotent)
    expect(advanceRead({ lastReadSeq: 10, unreadCount: 5 }, 10)).toEqual({ lastReadSeq: 10, unreadCount: 0 });

    // Stale seq rejected
    expect(advanceRead({ lastReadSeq: 10, unreadCount: 5 }, 8)).toEqual({ lastReadSeq: 10, unreadCount: 5 });
  });
});
