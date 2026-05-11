/**
 * Timeline V2 — scroll-event bridge.
 *
 * Subscribes to native `scroll` events on the outer element and converts
 * them into V2 owner events. The bridge is the only place in V2 that reads
 * `scrollTop` from the DOM; everything else uses the state machine.
 *
 * Three filters live here, all motivated by audit findings S2 and S10:
 *
 *   1. **Programmatic vs user scroll.** While a recent adapter-issued
 *      scroll command's TTL is active, native `scroll` events are
 *      classified as programmatic and dispatched as `BOTTOM_REACHED` (when
 *      we hit the target) or ignored. Without this filter, smooth-scroll
 *      animation frames flood the machine with phantom user-scroll events.
 *
 *   2. **rAF coalescing.** Native scroll events fire on every frame during
 *      drag/wheel. We coalesce to one dispatch per animation frame.
 *
 *   3. **Idle resolution.** After USER_SCROLL_IDLE_MS without a fresh
 *      scroll, we dispatch `USER_SCROLL_IDLE` so the machine can settle.
 *      The owner hook already implements this timer, so the bridge does NOT
 *      duplicate it — it just delivers `USER_SCROLL` with fresh distance
 *      metrics and lets the owner's idle effect handle the rest.
 */

import React from "react";
import { debugScroll } from "./scrollDebug";
import type { DomScrollAdapter } from "./domScrollAdapter";
import type { ScrollEvent } from "./scrollTypes";

export interface ScrollEventBridgeOptions {
  /** Getter for the scroll outer element. Called at every effect tick.
   *  Pass `() => ref.current` from inside a component. */
  getOuterElement: () => HTMLElement | null;
  adapter: DomScrollAdapter;
  dispatch: (event: ScrollEvent) => void;
  /** When the V2 owner hook has not yet taken ownership of scroll, the
   *  bridge runs in observe-only mode: it logs but does not dispatch.
   *  Defaults to `true` (active). Phase 1.5 wraps it in `false` to avoid
   *  conflicting with the legacy controller. */
  active?: boolean;
  now?: () => number;
}

export const useScrollEventBridge = ({
  getOuterElement,
  adapter,
  dispatch,
  active = true,
  now,
}: ScrollEventBridgeOptions): void => {
  const dispatchRef = React.useRef(dispatch);
  const adapterRef = React.useRef(adapter);
  const activeRef = React.useRef(active);
  const getOuterElementRef = React.useRef(getOuterElement);
  const nowFn = now ?? Date.now;

  React.useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);
  React.useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);
  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);
  React.useEffect(() => {
    getOuterElementRef.current = getOuterElement;
  }, [getOuterElement]);

  React.useEffect(() => {
    const el = getOuterElementRef.current();
    if (!el) return;

    let rafHandle: number | null = null;
    let lastDispatchedScrollTop = -1;

    const flush = () => {
      rafHandle = null;
      const target = getOuterElementRef.current();
      if (!target) return;
      const scrollTop = target.scrollTop;
      // Skip duplicate frames: native scroll events can fire repeatedly
      // with the same scrollTop on momentum-end.
      if (scrollTop === lastDispatchedScrollTop) return;
      lastDispatchedScrollTop = scrollTop;

      const distanceToBottom = Math.max(
        0,
        target.scrollHeight - target.clientHeight - scrollTop,
      );

      if (adapterRef.current.isProgrammaticScroll(scrollTop)) {
        // The adapter recognised this as a programmatic frame. If we hit
        // the bottom (or near it), surface BOTTOM_REACHED so the machine
        // can settle without us dispatching a phantom USER_SCROLL.
        if (distanceToBottom <= 1) {
          debugScroll("programmatic_scroll_end", {
            scrollTop,
            distanceToBottom,
          });
          if (activeRef.current) {
            dispatchRef.current({ type: "BOTTOM_REACHED", at: nowFn() });
          }
        }
        return;
      }

      debugScroll("user_scroll", { scrollTop, distanceToBottom });
      if (!activeRef.current) return;
      dispatchRef.current({
        type: "USER_SCROLL",
        distanceToBottom,
        at: nowFn(),
      });
    };

    const onScroll = () => {
      if (rafHandle !== null) return;
      rafHandle = window.requestAnimationFrame(flush);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
    };
    // We bind on the *current element identity* — when the timeline
    // remounts on conversation change the parent will pass a fresh getter
    // returning the new element. All other inputs are read via refs.
  }, [getOuterElement, nowFn]);
};
