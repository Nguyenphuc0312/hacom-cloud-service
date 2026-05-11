import { describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "../types";

const conversationMarkAsReadMock = vi.hoisted(() => vi.fn());
const getUnreadSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("../services/api", () => ({
  conversationApi: {
    markAsRead: conversationMarkAsReadMock,
    getUnreadSummary: getUnreadSummaryMock,
  },
}));

import { createChatUnreadController } from "./chatStoreUnread";

const createMockConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: "conv-1",
    unreadCount: 5,
    lastReadSeq: 10,
    lastReadMessageId: "msg-10",
    lastReadAt: "2024-01-01T00:00:00.000Z",
    firstUnreadMessageId: "msg-11",
    firstUnreadMessageAt: "2024-01-01T00:01:00.000Z",
    lastMessage: null,
    lastMessageAt: null,
    ...overrides,
  } as Conversation);

const createMockMessages = (): Message[] =>
  [
    { id: "msg-8", serverSeq: 8, createdAt: "2024-01-01T00:00:00.000Z" },
    { id: "msg-9", serverSeq: 9, createdAt: "2024-01-01T00:00:30.000Z" },
    { id: "msg-10", serverSeq: 10, createdAt: "2024-01-01T00:01:00.000Z" },
    { id: "msg-11", serverSeq: 11, createdAt: "2024-01-01T00:01:30.000Z" },
    { id: "msg-12", serverSeq: 12, createdAt: "2024-01-01T00:02:00.000Z" },
  ] as unknown as Message[];

const makeSuccessEnvelope = (data: unknown) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
});

const normalizeConversation = (
  c: Partial<Conversation>,
): Conversation | null => c as Conversation;

const buildConversationCollectionState = (
  _conversations: Conversation[],
): Partial<{ conversations: Conversation[] }> => ({ conversations: [] });

const compareAnchorIdsInConversation = (
  _messages: Message[],
  _leftId: string,
  _rightId: string,
): number => {
  const getSeq = (id: string) => parseInt(id.replace("msg-", ""), 10);
  return getSeq(_leftId) - getSeq(_rightId);
};

const getConversationCursorTimestamp = (
  _conversation: Conversation,
): number => Date.now();

const updateConversationReadProgress = (
  conversation: Conversation,
  lastReadMessageId?: string | null,
  _readAt?: Date | string | null,
  lastReadSeq?: number | null,
): Conversation => ({
  ...conversation,
  unreadCount: 0,
  lastReadMessageId: lastReadMessageId ?? conversation.lastReadMessageId,
  lastReadSeq: lastReadSeq ?? conversation.lastReadSeq,
  firstUnreadMessageId: null,
  firstUnreadMessageAt: null,
});

const EMPTY_MESSAGES: Message[] = [];

type MockState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  lastUnreadSummaryAppliedAt: number | null;
};

describe("chatStoreUnread — optimistic mark-read rollback", () => {
  describe("API success path", () => {
    it("commits optimistic state when API succeeds", async () => {
      let state: MockState = {
        conversations: [createMockConversation()],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () =>
          makeSuccessEnvelope({
            conversationId: "conv-1",
            lastReadSeq: 12,
            lastReadMessageId: "msg-12",
            unreadCount: 0,
          }),
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      await controller.markAsRead("conv-1", {
        lastReadSeq: 12,
        lastVisibleMessageId: "msg-12",
      });

      const conv = state.conversations[0];
      expect(conv.unreadCount).toBe(0);
    });
  });

  describe("API failure path — rollback", () => {
    it("rolls back unreadCount when mark-read API fails", async () => {
      let state: MockState = {
        conversations: [createMockConversation({ unreadCount: 5 })],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          throw new Error("Network error");
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      await expect(
        controller.markAsRead("conv-1", {
          lastReadSeq: 12,
          lastVisibleMessageId: "msg-12",
        }),
      ).rejects.toThrow("Network error");

      const conv = state.conversations[0];
      // After rollback, unreadCount must be restored to the pre-optimistic value
      expect(conv.unreadCount).toBe(5);
    });

    it("rolls back firstUnreadMessageId when mark-read API fails", async () => {
      let state: MockState = {
        conversations: [
          createMockConversation({
            unreadCount: 5,
            firstUnreadMessageId: "msg-11",
            firstUnreadMessageAt: "2024-01-01T00:01:00.000Z",
          }),
        ],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          throw new Error("Server error");
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      await expect(
        controller.markAsRead("conv-1", {
          lastReadSeq: 12,
          lastVisibleMessageId: "msg-12",
        }),
      ).rejects.toThrow("Server error");

      const conv = state.conversations[0];
      // firstUnreadMessageId must be restored to pre-optimistic value
      expect(conv.firstUnreadMessageId).toBe("msg-11");
      expect(conv.firstUnreadMessageAt).toBe("2024-01-01T00:01:00.000Z");
    });

    it("clears localMarkedReadSeq guard after API failure so retry succeeds", async () => {
      let state: MockState = {
        conversations: [createMockConversation({ unreadCount: 5 })],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };
      let attemptCount = 0;

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          attemptCount += 1;
          if (attemptCount === 1) throw new Error("Transient fail");
          return makeSuccessEnvelope({
            conversationId: "conv-1",
            lastReadSeq: 12,
            unreadCount: 0,
          });
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      // First attempt fails — should roll back and clear guard
      await expect(
        controller.markAsRead("conv-1", { lastReadSeq: 12 }),
      ).rejects.toThrow("Transient fail");

      // Second attempt must NOT be skipped — localMarkedReadSeq was cleared
      await controller.markAsRead("conv-1", { lastReadSeq: 13 });
      expect(attemptCount).toBe(2);
    });

    it("server snapshot is not blocked after rollback (localMarkedReadSeq cleared)", async () => {
      let state: MockState = {
        conversations: [
          createMockConversation({ unreadCount: 5, lastReadSeq: 10 }),
        ],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          throw new Error("Fail");
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      await expect(
        controller.markAsRead("conv-1", { lastReadSeq: 12 }),
      ).rejects.toThrow("Fail");

      // After rollback, a server snapshot with lower lastReadSeq must apply normally.
      // The stale guard must NOT block it because localMarkedReadSeq was cleared.
      controller.applyUnreadSummary({
        totalUnreadCount: 2,
        conversations: [
          {
            conversationId: "conv-1",
            unreadCount: 2,
            lastReadSeq: 10,
            lastReadMessageId: "msg-10",
            lastReadAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      });

      const conv = state.conversations[0];
      // Since localMarkedReadSeq was cleared, snapshot is NOT blocked
      expect(conv.unreadCount).toBe(2);
    });
  });

  describe("stale-overwrite guard", () => {
    it("prevents stale snapshot from overwriting optimistic read while in-flight", async () => {
      let state: MockState = {
        conversations: [createMockConversation({ unreadCount: 0, lastReadSeq: 12 })],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(
                  makeSuccessEnvelope({
                    conversationId: "conv-1",
                    lastReadSeq: 12,
                    unreadCount: 0,
                  }),
                ),
              50,
            ),
          ),
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      // Fire optimistic mark-read (API still pending)
      const pendingPromise = controller.markAsRead("conv-1", {
        lastReadSeq: 12,
        lastVisibleMessageId: "msg-12",
      });

      // While API in-flight, a stale snapshot arrives with old lastReadSeq=5
      controller.applyUnreadSummary({
        totalUnreadCount: 3,
        conversations: [
          {
            conversationId: "conv-1",
            unreadCount: 3,
            lastReadSeq: 5,
            lastReadMessageId: "msg-5",
            lastReadAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      });

      await pendingPromise;

      // The stale snapshot must NOT have overwritten the optimistic result
      const conv = state.conversations[0];
      expect(conv.unreadCount).toBe(0);
      expect(conv.lastReadSeq).toBe(12);
    });
  });

  describe("reset", () => {
    it("clears pendingRollbackSnapshot on reset", () => {
      let state: MockState = {
        conversations: [createMockConversation()],
        messages: { "conv-1": createMockMessages() },
        lastUnreadSummaryAppliedAt: null,
      };

      const controller = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          await new Promise((r) => setTimeout(r, 10));
          throw new Error("Fail");
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      // Trigger a failed mark-read (creates a snapshot)
      controller.markAsRead("conv-1", { lastReadSeq: 12 }).catch(() => {});

      // Reset must clear all pending state
      controller.reset();

      // After reset, a new mark-read should work normally
      let newAttempt = false;
      const controller2 = createChatUnreadController({
        set: (updater) => {
          state = (updater as (state: MockState) => MockState)(state);
        },
        get: () => state,
        emptyMessages: EMPTY_MESSAGES,
        markConversationAsRead: async () => {
          newAttempt = true;
          return makeSuccessEnvelope({ conversationId: "conv-1", lastReadSeq: 12, unreadCount: 0 });
        },
        getUnreadSummary: vi.fn(),
        compareAnchorIdsInConversation,
        normalizeConversation,
        buildConversationCollectionState,
        getConversationCursorTimestamp,
        updateConversationReadProgress,
      });

      controller2.markAsRead("conv-1", { lastReadSeq: 12 });
      expect(newAttempt).toBe(true);
    });
  });
});
