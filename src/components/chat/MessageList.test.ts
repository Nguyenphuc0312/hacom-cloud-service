import { describe, expect, it } from "vitest";

import {
  resolveTimelineMessageRenderState,
  resolveScrollCommandPriority,
  shouldAcceptScrollCommand,
} from "./messageListShared";
import { MessageStatus, MessageType } from "../../types";
import type { TimelineItem } from "../../hooks/useMessageGrouping";

const buildMessageItem = (overrides: Record<string, unknown> = {}): TimelineItem =>
  ({
    kind: "message",
    key: "message-row",
    message: {
      id: "msg-1",
      conversationId: "room-1",
      senderId: "user-1",
      senderName: "Alice",
      content: "hello",
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      createdAt: "2026-04-16T09:00:00.000Z",
      isDeleted: false,
      isPinned: false,
      isSystem: false,
      ...overrides,
    },
    isOwn: false,
    mergeLevel: "not-merged",
    showAvatar: true,
    showSenderName: true,
    showMeta: true,
    showStatus: false,
    isGroupStart: true,
    isGroupEnd: true,
    conversationType: "group",
    semanticFamily: "message",
    spacingToken: "default",
  }) as unknown as TimelineItem;

describe("MessageList scroll arbitration", () => {
  it("assigns higher priority to incoming and jump commands than unread restore", () => {
    expect(resolveScrollCommandPriority("jump-to-latest")).toBeGreaterThan(
      resolveScrollCommandPriority("conversation-restore-unread"),
    );
    expect(resolveScrollCommandPriority("incoming-message")).toBeGreaterThan(
      resolveScrollCommandPriority("conversation-restore-unread"),
    );
    expect(resolveScrollCommandPriority("self-message")).toBeGreaterThan(
      resolveScrollCommandPriority("conversation-restore-unread"),
    );
  });

  it("rejects unread restore while pinned to bottom", () => {
    const decision = shouldAcceptScrollCommand({
      nextCommand: {
        kind: "offset",
        offset: 120,
        reason: "conversation-restore-unread",
      },
      pendingCommand: null,
      isPinnedToBottom: true,
    });

    expect(decision).toEqual({
      accepted: false,
      reason: "restore_unread_blocked_while_pinned",
    });
  });

  it("rejects unread restore when a higher-priority incoming scroll is pending", () => {
    const decision = shouldAcceptScrollCommand({
      nextCommand: {
        kind: "offset",
        offset: 120,
        reason: "conversation-restore-unread",
      },
      pendingCommand: {
        kind: "bottom",
        reason: "incoming-message",
        priority: resolveScrollCommandPriority("incoming-message"),
        requestedAt: Date.now(),
      },
      isPinnedToBottom: false,
    });

    expect(decision).toEqual({
      accepted: false,
      reason: "lower_priority_than_pending",
    });
  });

  it("rejects equal-priority unrelated commands and keeps the existing pending command", () => {
    const decision = shouldAcceptScrollCommand({
      nextCommand: {
        kind: "offset",
        offset: 0,
        reason: "keyboard-home",
      },
      pendingCommand: {
        kind: "offset",
        offset: 240,
        reason: "keyboard-page-down",
        priority: resolveScrollCommandPriority("keyboard-page-down"),
        requestedAt: Date.now(),
      },
      isPinnedToBottom: false,
    });

    expect(decision).toEqual({
      accepted: false,
      reason: "equal_priority_keep_existing",
    });
  });

  it("accepts a higher-priority incoming scroll over a low-priority pending command", () => {
    const decision = shouldAcceptScrollCommand({
      nextCommand: {
        kind: "bottom",
        reason: "incoming-message",
      },
      pendingCommand: {
        kind: "offset",
        offset: 20,
        reason: "layout-change",
        priority: resolveScrollCommandPriority("layout-change"),
        requestedAt: Date.now(),
      },
      isPinnedToBottom: false,
    });

    expect(decision).toEqual({
      accepted: true,
      reason: "accepted_replaced_pending",
    });
  });

  it("marks pathological plain text rows as collapsed static render state", () => {
    const renderState = resolveTimelineMessageRenderState(
      buildMessageItem({
        content: "very long ".repeat(600),
      }),
      new Set<string>(),
    );

    expect(renderState).toEqual({
      renderMode: "collapsed",
      measurementMode: "static",
      isCollapsible: true,
    });
  });

  it("keeps reply and inline-url messages on the dynamic render path", () => {
    const renderState = resolveTimelineMessageRenderState(
      buildMessageItem({
        content: "see https://example.com",
        replyToMessage: {
          id: "msg-0",
          senderId: "user-2",
          senderName: "Bob",
          content: "quoted",
          type: MessageType.TEXT,
        },
      }),
      new Set<string>(),
    );

    expect(renderState.measurementMode).toBe("dynamic");
    expect(renderState.renderMode).toBe("expanded");
    expect(renderState.isCollapsible).toBe(false);
  });
});
