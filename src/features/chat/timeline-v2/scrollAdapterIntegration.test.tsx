/**
 * Phase 2 integration test — V2 owner + real DOM adapter + scroll-event
 * bridge against a JSDOM container.
 *
 * Asserts:
 *   1. The owner uses the adapter (not a no-op) and a programmatic command
 *      results in exactly ONE scrollTo call on the DOM element.
 *   2. The bridge converts native scroll events into USER_SCROLL with
 *      correct distanceToBottom (steps #2/#3 prep).
 *   3. While the programmatic-scroll TTL is active, native scroll frames
 *      do NOT cause a second adapter call (no double-scroll).
 */

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
import { createDomScrollAdapter } from "./domScrollAdapter";
import { useScrollEventBridge } from "./useScrollEventBridge";
import { MessageStatus, MessageType, type Message } from "../../../types";

const ME = "me";

const mkMsg = (id: string): Message =>
  ({
    id,
    conversationId: "c",
    senderId: "x",
    senderName: "x",
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

const flushRaf = async () => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
};

describe("Phase 2 integration — owner + adapter + bridge", () => {
  it("a programmatic initial-bottom resolves to ONE scrollTo call", () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;

    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useChatScrollOwnerV2({
          conversationId: "c",
          currentUserId: ME,
          messages: [mkMsg("1")],
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

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // Bottom = scrollHeight - clientHeight = 2000 - 500 = 1500
    expect(scrollSpy).toHaveBeenCalledWith({ top: 1500, behavior: "auto" });
  });

  it("native scroll events fired during programmatic TTL are NOT misclassified", async () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;
    const dispatchSpy = vi.fn();

    // Mount the bridge active=true so we can observe dispatch behavior.
    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch: dispatchSpy,
        active: true,
      }),
    );

    // Issue a programmatic scroll: target = 1500.
    adapter.scrollToBottom("instant");
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // Simulate the native scroll event the browser would fire as a result.
    el.scrollTop = 1500;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    // The bridge should have classified the frame as programmatic. Either:
    //   - emitted BOTTOM_REACHED (we landed at bottom), OR
    //   - emitted nothing.
    // It MUST NOT emit USER_SCROLL.
    const userScrollCalls = dispatchSpy.mock.calls.filter(
      (call) => (call[0] as { type: string }).type === "USER_SCROLL",
    );
    expect(userScrollCalls).toHaveLength(0);
  });

  it("bridge emits USER_SCROLL when no programmatic scroll is in flight", async () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const dispatchSpy = vi.fn();

    renderHook(() =>
      useScrollEventBridge({
        getOuterElement: () => el,
        adapter,
        dispatch: dispatchSpy,
        active: true,
      }),
    );

    el.scrollTop = 300;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "USER_SCROLL",
        distanceToBottom: 1200,
      }),
    );
  });

  it("owner driving an own-message scroll does NOT cause a feedback loop with the bridge", async () => {
    const el = mkScrollEl();
    const adapter = createDomScrollAdapter(() => el);
    const scrollSpy = el.scrollTo as unknown as ReturnType<typeof vi.fn>;
    const ownDispatchObserved = vi.fn();

    const { result, rerender } = renderHook(
      ({ messages }: { messages: Message[] }) => {
        const owner = useChatScrollOwnerV2({
          conversationId: "c",
          currentUserId: ME,
          messages,
          isInitialLoading: false,
          isFetchingOlder: false,
          hasOlder: false,
          adapter,
        });
        // Wrap dispatch so we can detect USER_SCROLL re-entries the bridge
        // might send while the programmatic TTL is active.
        const wrapped = React.useCallback(
          (e: Parameters<typeof owner.dispatch>[0]) => {
            ownDispatchObserved(e);
            owner.dispatch(e);
          },
          [owner],
        );
        useScrollEventBridge({
          getOuterElement: () => el,
          adapter,
          dispatch: wrapped,
          active: true,
        });
        return owner;
      },
      { initialProps: { messages: [mkMsg("1")] } },
    );
    expect(result.current).toBeDefined();

    // Trigger an own-message append. The owner should classify this as
    // append_own and enqueue an own_message_sent → bottom scroll.
    act(() => {
      rerender({
        messages: [mkMsg("1"), { ...mkMsg("2"), senderId: ME }],
      });
    });

    const callsAfterAppend = scrollSpy.mock.calls.length;
    expect(callsAfterAppend).toBeGreaterThanOrEqual(1);

    // Simulate the native scroll event the browser would fire as the DOM
    // scrollTop catches up to the programmatic target.
    el.scrollTop = 1500;
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await flushRaf();
    });

    // The bridge must not have caused a SECOND scrollTo call.
    expect(scrollSpy.mock.calls.length).toBe(callsAfterAppend);

    // And no USER_SCROLL should have re-entered the owner.
    const userScrollCalls = ownDispatchObserved.mock.calls.filter(
      (call) => (call[0] as { type: string }).type === "USER_SCROLL",
    );
    expect(userScrollCalls).toHaveLength(0);
  });
});
