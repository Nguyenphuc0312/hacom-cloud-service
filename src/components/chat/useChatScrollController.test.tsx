import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetChatScrollSessionsForTest,
  useChatScrollController,
  type ChatScrollControllerParams,
} from "./useChatScrollController";
import { MessageStatus, MessageType, type Message } from "../../types";

const ROW_HEIGHT = 48;
const VIEWPORT_HEIGHT = 480;
const CURRENT_USER_ID = "user-current";
const OTHER_USER_ID = "user-other";

type HookProps = {
  conversationId: string;
  messages: Message[];
  currentUserId?: string;
  hasUnread?: boolean;
  isInitialLoading?: boolean;
  hasLoaded?: boolean;
  isFetchingMessages?: boolean;
  hasMoreOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  virtualItemsCount?: number;
};

type ScrollContainer = HTMLDivElement & {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

const buildMessage = (
  index: number,
  overrides: Partial<Message> = {},
): Message =>
  ({
    id: `msg-${index}`,
    conversationId: "room-a",
    senderId: OTHER_USER_ID,
    senderName: "Other User",
    content: `message ${index}`,
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    createdAt: new Date(2026, 0, 1, 0, 0, index % 60).toISOString(),
    serverSeq: index,
    isDeleted: false,
    isPinned: false,
    isSystem: false,
    ...overrides,
  }) as Message;

const buildMessages = (
  count: number,
  options: { start?: number; conversationId?: string; senderId?: string } = {},
): Message[] => {
  const start = options.start ?? 0;
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return buildMessage(index, {
      id: `msg-${index}`,
      conversationId: options.conversationId ?? "room-a",
      senderId: options.senderId ?? OTHER_USER_ID,
      serverSeq: index,
      content: `message ${index}`,
    });
  });
};

const installRafMock = () => {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((handle: number) => {
      callbacks.delete(handle);
    }),
  );

  return {
    get pendingCount() {
      return callbacks.size;
    },
    flush: async (limit = 20) => {
      for (let index = 0; index < limit && callbacks.size > 0; index += 1) {
        const pending = Array.from(callbacks.entries());
        callbacks.clear();
        await act(async () => {
          pending.forEach(([, callback]) => {
            callback(performance.now());
          });
        });
      }
    },
  };
};

const createScrollContainer = (): ScrollContainer =>
  ({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: VIEWPORT_HEIGHT,
  }) as ScrollContainer;

const getBottomOffset = (messageCount: number): number =>
  Math.max(0, messageCount * ROW_HEIGHT - VIEWPORT_HEIGHT);

const createHarness = (
  initialProps: HookProps,
  options: { strict?: boolean } = {},
) => {
  const raf = installRafMock();
  const container = createScrollContainer();
  const outerRef = { current: container } as React.RefObject<HTMLDivElement | null>;
  const scrollToIndex = vi.fn(
    (
      index: number,
      align?: "start" | "center" | "end" | "auto",
      behavior?: "auto" | "smooth",
    ) => {
      void align;
      void behavior;
      container.scrollTop = Math.max(0, (index + 1) * ROW_HEIGHT - container.clientHeight);
    },
  );
  const scrollToOffset = vi.fn((offset: number) => {
    container.scrollTop = Math.max(0, offset);
  });
  let latestProps = initialProps;

  const buildParams = (props: HookProps): ChatScrollControllerParams => {
    latestProps = props;
    container.clientHeight = VIEWPORT_HEIGHT;
    container.scrollHeight = props.messages.length * ROW_HEIGHT;

    return {
      conversationId: props.conversationId,
      messages: props.messages,
      currentUserId: props.currentUserId ?? CURRENT_USER_ID,
      hasUnread: props.hasUnread ?? false,
      isInitialLoading: props.isInitialLoading ?? false,
      hasLoaded: props.hasLoaded ?? true,
      isFetchingMessages: props.isFetchingMessages ?? false,
      hasMoreOlder: props.hasMoreOlder ?? false,
      isLoadingOlder: props.isLoadingOlder ?? false,
      onLoadOlder: props.onLoadOlder,
      outerRef,
      itemCount: props.messages.length,
      virtualItemsCount:
        props.messages.length === 0 ? 0 : (props.virtualItemsCount ?? Math.min(24, props.messages.length)),
      totalSize: props.messages.length * ROW_HEIGHT,
      viewportHeight: VIEWPORT_HEIGHT,
      getItemOffset: (index) => index * ROW_HEIGHT,
      resolveMessageIndex: (messageId) =>
        props.messages.findIndex((message) => message.id === messageId),
      captureVisibleAnchor: () => {
        if (props.messages.length === 0) return null;
        const index = Math.min(
          props.messages.length - 1,
          Math.max(0, Math.floor(container.scrollTop / ROW_HEIGHT)),
        );
        return {
          messageId: props.messages[index]?.id ?? null,
          offsetFromTop: container.scrollTop - index * ROW_HEIGHT,
        };
      },
      scrollToOffset,
      scrollToIndex,
    };
  };

  const wrapper = options.strict
    ? ({ children }: { children: React.ReactNode }) => (
        <React.StrictMode>{children}</React.StrictMode>
      )
    : undefined;

  const hook = renderHook((props: HookProps) => useChatScrollController(buildParams(props)), {
    initialProps,
    wrapper,
  });

  const rerender = (nextProps: Partial<HookProps>) => {
    const merged = {
      ...latestProps,
      ...nextProps,
    };
    hook.rerender(merged);
  };

  const settle = async (limit = 20) => {
    await act(async () => undefined);
    await raf.flush(limit);
    await act(async () => undefined);
  };

  return {
    ...hook,
    container,
    raf,
    rerender,
    scrollToIndex,
    scrollToOffset,
    settle,
  };
};

describe("useChatScrollController", () => {
  beforeEach(() => {
    __resetChatScrollSessionsForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetChatScrollSessionsForTest();
  });

  it("opens a conversation with 100 messages at the latest row", async () => {
    const messages = buildMessages(100);
    const harness = createHarness({
      conversationId: "room-a",
      messages,
    });

    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(99, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(100));
    expect(harness.result.current.mode).toBe("settled_at_bottom");
  });

  it("opens a conversation with 10k messages at the latest row without rendering assumptions", async () => {
    const messages = buildMessages(10_000);
    const harness = createHarness({
      conversationId: "room-a",
      messages,
      virtualItemsCount: 32,
    });

    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(9_999, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(10_000));
    expect(harness.result.current.isPinnedToBottom).toBe(true);
  });

  it("follows latest when cached RTK messages refresh with a newer tail during opening", async () => {
    const cachedMessages = buildMessages(100);
    const refreshedMessages = [...cachedMessages, ...buildMessages(5, { start: 100 })];
    const harness = createHarness({
      conversationId: "room-a",
      messages: cachedMessages,
      isFetchingMessages: true,
    });

    harness.rerender({
      messages: refreshedMessages,
      isFetchingMessages: false,
    });
    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(104, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(105));
  });

  it("restores history only when returning with the same latest key", async () => {
    const roomAMessages = buildMessages(100, { conversationId: "room-a" });
    const roomBMessages = buildMessages(20, { conversationId: "room-b" });
    const harness = createHarness({
      conversationId: "room-a",
      messages: roomAMessages,
    });
    await harness.settle();

    await act(async () => {
      harness.container.scrollTop = ROW_HEIGHT * 20 + 7;
      harness.result.current.handleUserScroll(harness.container.scrollTop);
    });
    harness.rerender({
      conversationId: "room-b",
      messages: roomBMessages,
    });
    await harness.settle();

    harness.scrollToIndex.mockClear();
    harness.scrollToOffset.mockClear();
    harness.rerender({
      conversationId: "room-a",
      messages: roomAMessages,
      hasUnread: false,
    });
    await harness.settle();

    expect(harness.scrollToIndex).not.toHaveBeenCalled();
    expect(harness.scrollToOffset).toHaveBeenLastCalledWith(ROW_HEIGHT * 20 + 7, "auto");
    expect(harness.container.scrollTop).toBe(ROW_HEIGHT * 20 + 7);
    expect(harness.result.current.mode).toBe("settled_reading_history");
  });

  it("invalidates restore when latest key changes and unread/newer tail should win bottom", async () => {
    const roomAMessages = buildMessages(100, { conversationId: "room-a" });
    const roomBMessages = buildMessages(20, { conversationId: "room-b" });
    const roomAWithNewTail = [
      ...roomAMessages,
      buildMessage(100, { conversationId: "room-a", id: "msg-100", serverSeq: 100 }),
    ];
    const harness = createHarness({
      conversationId: "room-a",
      messages: roomAMessages,
    });
    await harness.settle();

    await act(async () => {
      harness.container.scrollTop = ROW_HEIGHT * 20;
      harness.result.current.handleUserScroll(harness.container.scrollTop);
    });
    harness.rerender({
      conversationId: "room-b",
      messages: roomBMessages,
    });
    await harness.settle();

    harness.scrollToIndex.mockClear();
    harness.scrollToOffset.mockClear();
    harness.rerender({
      conversationId: "room-a",
      messages: roomAWithNewTail,
      hasUnread: true,
    });
    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(100, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(101));
    expect(harness.result.current.mode).toBe("settled_at_bottom");
  });

  it("follows a new message when the user is near bottom", async () => {
    const messages = buildMessages(100);
    const nextMessages = [...messages, buildMessage(100)];
    const harness = createHarness({
      conversationId: "room-a",
      messages,
    });
    await harness.settle();

    harness.scrollToIndex.mockClear();
    harness.container.scrollTop = getBottomOffset(100) - 40;
    harness.rerender({ messages: nextMessages });
    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(100, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(101));
    expect(harness.result.current.pendingNewMessages).toBe(0);
  });

  it("holds position and increments new message count while reading history", async () => {
    const messages = buildMessages(100);
    const nextMessages = [...messages, buildMessage(100)];
    const harness = createHarness({
      conversationId: "room-a",
      messages,
    });
    await harness.settle();

    const readingOffset = ROW_HEIGHT * 25;
    harness.scrollToIndex.mockClear();
    harness.scrollToOffset.mockClear();
    await act(async () => {
      harness.container.scrollTop = readingOffset;
      harness.result.current.handleUserScroll(readingOffset);
    });
    harness.rerender({ messages: nextMessages });
    await harness.settle();

    expect(harness.scrollToIndex).not.toHaveBeenCalled();
    expect(harness.scrollToOffset).not.toHaveBeenCalled();
    expect(harness.container.scrollTop).toBe(readingOffset);
    expect(harness.result.current.pendingNewMessages).toBe(1);
    expect(harness.result.current.mode).toBe("settled_reading_history");
  });

  it("forces bottom for an own message while reading history", async () => {
    const messages = buildMessages(100);
    const nextMessages = [
      ...messages,
      buildMessage(100, { senderId: CURRENT_USER_ID }),
    ];
    const harness = createHarness({
      conversationId: "room-a",
      messages,
    });
    await harness.settle();

    await act(async () => {
      harness.container.scrollTop = ROW_HEIGHT * 25;
      harness.result.current.handleUserScroll(harness.container.scrollTop);
    });
    harness.scrollToIndex.mockClear();
    harness.rerender({ messages: nextMessages });
    await harness.settle();

    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(100, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(101));
    expect(harness.result.current.pendingNewMessages).toBe(0);
  });

  it("preserves the anchor on older prepend and does not run a bottom command", async () => {
    const messages = buildMessages(100, { start: 100 });
    const olderMessages = buildMessages(100, { start: 0 });
    const onLoadOlder = vi.fn().mockResolvedValue(undefined);
    const harness = createHarness({
      conversationId: "room-a",
      messages,
      hasMoreOlder: true,
      onLoadOlder,
    });
    await harness.settle();

    const previousOffset = ROW_HEIGHT * 2 + 12;
    harness.scrollToIndex.mockClear();
    harness.scrollToOffset.mockClear();
    await act(async () => {
      harness.container.scrollTop = previousOffset;
      harness.result.current.handleUserScroll(previousOffset);
    });
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    harness.rerender({
      messages: [...olderMessages, ...messages],
      hasMoreOlder: true,
      onLoadOlder,
    });
    await harness.settle();

    expect(harness.scrollToIndex).not.toHaveBeenCalled();
    expect(harness.scrollToOffset).toHaveBeenLastCalledWith(
      previousOffset + olderMessages.length * ROW_HEIGHT,
      "auto",
    );
    expect(harness.container.scrollTop).toBe(previousOffset + olderMessages.length * ROW_HEIGHT);
  });

  it("settles once at bottom under StrictMode double effects", async () => {
    const messages = buildMessages(100);
    const harness = createHarness(
      {
        conversationId: "room-a",
        messages,
      },
      { strict: true },
    );

    await harness.settle();

    const bottomCalls = harness.scrollToIndex.mock.calls.filter(
      ([index, align]) => index === 99 && align === "end",
    );
    expect(bottomCalls).toHaveLength(1);
    expect(harness.container.scrollTop).toBe(getBottomOffset(100));
    expect(harness.result.current.mode).toBe("settled_at_bottom");
  });

  it("cancels pending commands when switching conversations before RAF flush", async () => {
    const roomAMessages = buildMessages(100, { conversationId: "room-a" });
    const roomBMessages = buildMessages(5, { conversationId: "room-b" });
    const harness = createHarness({
      conversationId: "room-a",
      messages: roomAMessages,
    });

    expect(harness.raf.pendingCount).toBeGreaterThan(0);
    harness.rerender({
      conversationId: "room-b",
      messages: roomBMessages,
    });
    await harness.settle();

    expect(
      harness.scrollToIndex.mock.calls.some(([index]) => index === roomAMessages.length - 1),
    ).toBe(false);
    expect(harness.scrollToIndex).toHaveBeenLastCalledWith(4, "end", "auto");
    expect(harness.container.scrollTop).toBe(getBottomOffset(5));
  });
});
