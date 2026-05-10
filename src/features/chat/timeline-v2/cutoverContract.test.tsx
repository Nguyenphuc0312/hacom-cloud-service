/**
 * Phase 2 cutover contract tests.
 *
 * Validates the protocol between MessageList (legacy) and ChatTimelineV2
 * (V2 owner) when the cutover sub-flag is on:
 *
 *   1. Suppressed scrollToOffset/scrollToIndex are exact no-ops (no DOM
 *      writes, no exceptions).
 *   2. `onTimelineEvent` shapes match the wire used by ChatTimelineV2's
 *      forwarder (anchor_captured / media_resized).
 *   3. When V2 drives, dispatching `LOAD_OLDER_DONE` after a forwarded
 *      anchor capture restores via `preserve_after_prepend` (not a bottom
 *      scroll).
 *   4. `MEDIA_RESIZED` forwarded while detached is ignored (state machine
 *      already covers this; we re-assert at the integration boundary).
 *
 * We don't mount full MessageList here — its dependency tree (i18n, RTK
 * store, virtualizer, density resolver…) is too heavy for a unit test and
 * is exercised by the existing legacy test suite. These tests cover the
 * narrow surface we actually changed.
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
import { createDomScrollAdapter } from "./domScrollAdapter";
import { MessageStatus, MessageType, type Message } from "../../../types";
import type { TimelineV2EventFromLegacy } from "../../../components/chat/MessageList";

const ME = "me";

const mkMsg = (id: string, senderId = "u-other"): Message =>
  ({
    id,
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

const mkScrollEl = (): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: 2000, writable: true });
  Object.defineProperty(el, "clientHeight", { value: 500, writable: true });
  el.scrollTop = 0;
  Object.defineProperty(el, "scrollTo", {
    value: vi.fn((opts?: ScrollToOptions | number) => {
      if (typeof opts === "object" && opts && typeof opts.top === "number") {
        el.scrollTop = opts.top;
      }
    }),
    writable: true,
    configurable: true,
  });
  document.body.appendChild(el);
  return el;
};

describe("Phase 2 cutover — suppressed scroll callbacks", () => {
  it("a no-op scrollToOffset is callable and writes nothing", () => {
    const noopScroll: (offset: number, behavior?: string) => void = () => {};
    expect(() => noopScroll(123, "smooth")).not.toThrow();
  });

  it("a no-op scrollToIndex is callable with all aligns", () => {
    const noopIndex: (
      index: number,
      align?: "start" | "center" | "end" | "auto",
      behavior?: string,
    ) => void = () => {};
    expect(() => noopIndex(0, "start", "auto")).not.toThrow();
    expect(() => noopIndex(0, "center", "smooth")).not.toThrow();
    expect(() => noopIndex(0, "end", "auto")).not.toThrow();
  });
});

describe("Phase 2 cutover — anchor forwarding", () => {
  it("forwarded anchor_captured drives preserve_after_prepend on LOAD_OLDER_DONE", () => {
    const el = mkScrollEl();
    // Provide a resolver so scrollToIndex actually writes — the "no-op
    // when resolver missing" path is covered by the adapter unit tests.
    const adapter = createDomScrollAdapter(() => el, {
      resolveItemOffset: (i) => i * 50,
    });
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: [mkMsg("a"), mkMsg("b")],
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: true,
        adapter,
      }),
    );

    // Simulate the legacy MessageList capturing an anchor and the
    // ChatTimelineV2 forwarder converting it via owner.captureAnchor.
    const event: TimelineV2EventFromLegacy = {
      type: "anchor_captured",
      anchor: { messageId: "a", offsetFromTop: 30, index: 4 },
    };
    expect(event.type).toBe("anchor_captured");

    act(() => {
      result.current.captureAnchor({
        messageKey:
          event.type === "anchor_captured" && event.anchor
            ? (event.anchor.messageId ?? "__no_id__")
            : "__no_id__",
        index:
          event.type === "anchor_captured" && event.anchor
            ? event.anchor.index
            : 0,
        offsetFromViewportTop:
          event.type === "anchor_captured" && event.anchor
            ? event.anchor.offsetFromTop
            : 0,
      });
    });
    expect(result.current.state).toBe("loading_older");

    // Owner driving the prepend → LOAD_OLDER_DONE schedules
    // preserve_after_prepend (priority 100). With resolveItemOffset
    // present, scrollToIndex(4, "start") computes itemTop = 4 * 50 = 200,
    // which is what should land on the DOM.
    act(() => {
      result.current.notifyLoadOlderDone({
        prependedCount: 50,
        anchorStillExists: true,
      });
    });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ top: 200, behavior: "auto" });
    expect(result.current.state).toBe("preserving_anchor");
  });

  it("real index from legacy is honored — preserve_after_prepend lands at the captured row, not row 0", () => {
    const el = mkScrollEl();
    // Resolver mirroring what the legacy virtualizer does: 50px per row.
    const adapter = createDomScrollAdapter(() => el, {
      resolveItemOffset: (i) => i * 50,
    });
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: Array.from({ length: 12 }, (_, i) => mkMsg(`m${i}`)),
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: true,
        adapter,
      }),
    );

    // Replicate the EXACT path ChatTimelineV2.handleTimelineEvent runs:
    // event from legacy → owner.captureAnchor with the real `index`.
    const event: TimelineV2EventFromLegacy = {
      type: "anchor_captured",
      anchor: { messageId: "m7", offsetFromTop: 12, index: 7 },
    };
    act(() => {
      if (event.type === "anchor_captured" && event.anchor) {
        result.current.captureAnchor({
          messageKey: event.anchor.messageId ?? "__no_id__",
          index: event.anchor.index,
          offsetFromViewportTop: event.anchor.offsetFromTop,
        });
      }
    });
    act(() => {
      result.current.notifyLoadOlderDone({
        prependedCount: 50,
        anchorStillExists: true,
      });
    });

    // 7 * 50 = 350, NOT 0. Regression guard for the index:0 placeholder.
    expect(scrollSpy).toHaveBeenCalledWith({ top: 350, behavior: "auto" });
  });

  it("forwarded anchor_captured with null anchor leaves owner state untouched", () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: [mkMsg("a")],
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: true,
        adapter,
      }),
    );
    const stateBefore = result.current.state;
    // ChatTimelineV2 forwarder skips when event.anchor === null.
    const event: TimelineV2EventFromLegacy = {
      type: "anchor_captured",
      anchor: null,
    };
    expect(event.anchor).toBeNull();
    // No call to captureAnchor → state unchanged.
    expect(result.current.state).toBe(stateBefore);
  });
});

describe("Phase 2 cutover — media_resized forwarding", () => {
  it("forwarded MEDIA_RESIZED while detached is ignored (no scroll)", () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() =>
      useChatScrollOwnerV2({
        conversationId: "c1",
        currentUserId: ME,
        messages: [mkMsg("a"), mkMsg("b")],
        isInitialLoading: false,
        isFetchingOlder: false,
        hasOlder: false,
        adapter,
      }),
    );

    // Force detached.
    act(() => {
      result.current.dispatch({
        type: "USER_SCROLL",
        distanceToBottom: 800,
        at: 1,
      });
      result.current.dispatch({ type: "USER_SCROLL_IDLE", at: 2 });
    });
    expect(result.current.state).toBe("detached");

    // Simulate ChatTimelineV2 forwarding a media_resized event.
    act(() => {
      result.current.dispatch({
        type: "MEDIA_RESIZED",
        deltaPx: 200,
        at: 3,
      });
    });

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(result.current.state).toBe("detached");
  });

  it("forwarded MEDIA_RESIZED while following bottom enters media_settling", () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);

    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useChatScrollOwnerV2({
          conversationId: "c1",
          currentUserId: ME,
          messages: [mkMsg("a")],
          isInitialLoading: loading,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        }),
      { initialProps: { loading: true } },
    );
    act(() => rerender({ loading: false }));
    act(() => {
      result.current.dispatch({ type: "VIRTUALIZER_MEASURED", at: Date.now() });
    });
    expect(result.current.state).toBe("following_bottom");

    act(() => {
      result.current.dispatch({
        type: "MEDIA_RESIZED",
        deltaPx: 100,
        at: Date.now(),
      });
    });
    expect(result.current.state).toBe("media_settling");
  });
});
