import { describe, expect, it } from "vitest";
import {
  initialContext,
  initialState,
  resolvePinnedToBottom,
  transition,
  type MachineContext,
} from "./scrollStateMachine";
import type { ScrollEvent } from "./scrollTypes";

const mkCtx = (overrides: Partial<MachineContext> = {}): MachineContext => ({
  ...initialContext(),
  conversationId: "c1",
  ...overrides,
});

describe("scrollStateMachine.resolvePinnedToBottom (hysteresis)", () => {
  it("enters pinned at <= 24px", () => {
    expect(resolvePinnedToBottom(20, false)).toBe(true);
    expect(resolvePinnedToBottom(25, false)).toBe(false);
  });

  it("stays pinned until > 80px once pinned", () => {
    expect(resolvePinnedToBottom(50, true)).toBe(true);
    expect(resolvePinnedToBottom(79, true)).toBe(true);
    expect(resolvePinnedToBottom(80, true)).toBe(false);
  });
});

describe("scrollStateMachine.transition", () => {
  it("CONVERSATION_OPENED resets context and lands in `opening`", () => {
    const result = transition(initialState, mkCtx(), {
      type: "CONVERSATION_OPENED",
      conversationId: "c2",
      at: 0,
    });
    expect(result.next).toBe("opening");
    expect(result.context.conversationId).toBe("c2");
    expect(result.context.measured).toBe(false);
    expect(result.context.pendingNewMessages).toBe(0);
  });

  it("MESSAGES_READY with empty list pins immediately to bottom", () => {
    const result = transition("opening", mkCtx(), {
      type: "MESSAGES_READY",
      messageCount: 0,
      at: 1,
    });
    expect(result.next).toBe("following_bottom");
    expect(result.context.isPinnedToBottom).toBe(true);
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("VIRTUALIZER_MEASURED after measuring_initial enqueues initial_bottom", () => {
    const result = transition("measuring_initial", mkCtx(), {
      type: "VIRTUALIZER_MEASURED",
      at: 2,
    });
    expect(result.next).toBe("following_bottom");
    expect(result.effects.enqueue).toEqual([
      expect.objectContaining({
        reason: "initial_bottom",
        target: { kind: "bottom" },
        behavior: "instant",
      }),
    ]);
  });

  it("VIRTUALIZER_MEASURED outside measuring_initial does NOT enqueue scroll", () => {
    const result = transition("following_bottom", mkCtx({ measured: true }), {
      type: "VIRTUALIZER_MEASURED",
      at: 3,
    });
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("USER_SCROLL forces user_scrolling and updates pin state", () => {
    const result = transition("following_bottom", mkCtx({ isPinnedToBottom: true }), {
      type: "USER_SCROLL",
      distanceToBottom: 200,
      at: 10,
    });
    expect(result.next).toBe("user_scrolling");
    expect(result.context.isPinnedToBottom).toBe(false);
    expect(result.context.isUserScrolling).toBe(true);
  });

  it("USER_SCROLL_IDLE resolves to following_bottom or detached based on pin", () => {
    expect(
      transition("user_scrolling", mkCtx({ isUserScrolling: true, isPinnedToBottom: true }), {
        type: "USER_SCROLL_IDLE",
        at: 11,
      }).next,
    ).toBe("following_bottom");

    expect(
      transition("user_scrolling", mkCtx({ isUserScrolling: true, isPinnedToBottom: false }), {
        type: "USER_SCROLL_IDLE",
        at: 12,
      }).next,
    ).toBe("detached");
  });

  it("OWN_MESSAGE_SENT always enqueues bottom regardless of detach", () => {
    const result = transition("detached", mkCtx({ isPinnedToBottom: false }), {
      type: "OWN_MESSAGE_SENT",
      messageKey: "m1",
      at: 20,
    });
    expect(result.next).toBe("sending_own_message");
    expect(result.context.isPinnedToBottom).toBe(true);
    expect(result.effects.enqueue[0]).toEqual(
      expect.objectContaining({ reason: "own_message_sent" }),
    );
  });

  it("REMOTE_MESSAGE_APPENDED while following_bottom enqueues bottom", () => {
    const result = transition(
      "following_bottom",
      mkCtx({ isPinnedToBottom: true, isUserScrolling: false }),
      {
        type: "REMOTE_MESSAGE_APPENDED",
        messageKeys: ["x"],
        distanceToBottom: 5,
        at: 30,
      },
    );
    expect(result.next).toBe("receiving_remote_message");
    expect(result.effects.enqueue[0]).toEqual(
      expect.objectContaining({ reason: "remote_message_following" }),
    );
    expect(result.effects.badgeDelta).toBe(0);
  });

  it("REMOTE_MESSAGE_APPENDED while detached only bumps badge — no scroll", () => {
    const result = transition(
      "detached",
      mkCtx({ isPinnedToBottom: false, pendingNewMessages: 2 }),
      {
        type: "REMOTE_MESSAGE_APPENDED",
        messageKeys: ["x", "y"],
        distanceToBottom: 400,
        at: 31,
      },
    );
    expect(result.next).toBe("detached");
    expect(result.effects.enqueue).toHaveLength(0);
    expect(result.effects.badgeDelta).toBe(2);
    expect(result.context.pendingNewMessages).toBe(4);
  });

  it("REMOTE_MESSAGE_APPENDED while user_scrolling does NOT scroll", () => {
    const result = transition(
      "user_scrolling",
      mkCtx({ isUserScrolling: true, isPinnedToBottom: true }),
      {
        type: "REMOTE_MESSAGE_APPENDED",
        messageKeys: ["x"],
        distanceToBottom: 5,
        at: 32,
      },
    );
    expect(result.next).toBe("user_scrolling");
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("LOAD_OLDER_DONE with anchor present enqueues preserve_after_prepend", () => {
    const ctx = mkCtx({
      loadingOlderAnchor: { messageKey: "k", index: 12, offsetFromViewportTop: 30 },
    });
    const result = transition("loading_older", ctx, {
      type: "LOAD_OLDER_DONE",
      prependedCount: 50,
      anchorStillExists: true,
      at: 40,
    });
    expect(result.next).toBe("preserving_anchor");
    expect(result.effects.enqueue[0]).toEqual(
      expect.objectContaining({ reason: "preserve_after_prepend" }),
    );
  });

  it("LOAD_OLDER_DONE with anchor lost falls back to detached, no scroll", () => {
    const ctx = mkCtx({
      loadingOlderAnchor: { messageKey: "k", index: 12, offsetFromViewportTop: 30 },
    });
    const result = transition("loading_older", ctx, {
      type: "LOAD_OLDER_DONE",
      prependedCount: 50,
      anchorStillExists: false,
      at: 41,
    });
    expect(result.next).toBe("detached");
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("MEDIA_RESIZED while detached is ignored", () => {
    const result = transition("detached", mkCtx({ isPinnedToBottom: false }), {
      type: "MEDIA_RESIZED",
      deltaPx: 100,
      at: 50,
    });
    expect(result.next).toBe("detached");
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("MEDIA_RESIZED while user_scrolling is ignored", () => {
    const result = transition("user_scrolling", mkCtx({ isUserScrolling: true }), {
      type: "MEDIA_RESIZED",
      deltaPx: 100,
      at: 51,
    });
    expect(result.next).toBe("user_scrolling");
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("MEDIA_RESIZED while loading_older is ignored (anchor preserve owns it)", () => {
    const result = transition("loading_older", mkCtx(), {
      type: "MEDIA_RESIZED",
      deltaPx: 200,
      at: 52,
    });
    expect(result.next).toBe("loading_older");
    expect(result.effects.enqueue).toHaveLength(0);
  });

  it("JUMP_TO_LATEST clears badge and enqueues click_new_message_badge", () => {
    const result = transition("detached", mkCtx({ pendingNewMessages: 5 }), {
      type: "JUMP_TO_LATEST",
      at: 60,
    });
    expect(result.next).toBe("jumping_to_latest");
    expect(result.context.pendingNewMessages).toBe(0);
    expect(result.effects.enqueue[0]).toEqual(
      expect.objectContaining({ reason: "click_new_message_badge" }),
    );
    expect(result.effects.badgeDelta).toBe(-5);
  });

  it("BOTTOM_REACHED settles into following_bottom and clears badge", () => {
    const result = transition("receiving_remote_message", mkCtx({ pendingNewMessages: 3 }), {
      type: "BOTTOM_REACHED",
      at: 70,
    });
    expect(result.next).toBe("following_bottom");
    expect(result.context.pendingNewMessages).toBe(0);
  });

  it("PROGRAMMATIC_SCROLL_END is a no-op transition", () => {
    const before = mkCtx({ isPinnedToBottom: true });
    const result = transition("scrolling_to_bottom" as never, before, {
      type: "PROGRAMMATIC_SCROLL_END",
      commandId: "x",
      at: 80,
    } as ScrollEvent);
    expect(result.context).toEqual(before);
  });
});
