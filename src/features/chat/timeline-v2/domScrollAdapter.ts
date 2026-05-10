/**
 * Timeline V2 — DOM-based scroll adapter.
 *
 * Phase 2: real implementation of `ScrollVirtualizerAdapter`. Operates on the
 * scroll container's HTMLElement directly, not on a specific virtualizer
 * library. This is intentional:
 *
 *   - The adapter doesn't need to know whether @tanstack/react-virtual,
 *     react-window, or a plain scroller is rendering rows.
 *   - All it needs to issue commands is the outer element + a way to
 *     translate index → pixel offset (provided by the caller, defers to
 *     whatever virtualizer is in use).
 *   - All it needs to read state is `scrollTop`, `scrollHeight`,
 *     `clientHeight` from the same element.
 *
 * The adapter exposes a programmatic-scroll TTL flag that the scroll-event
 * bridge consults to distinguish user vs system scroll. The TTL grows with
 * the scroll distance so smooth-scrolling long timelines doesn't get
 * misclassified as user input.
 */

import type { ScrollBehavior } from "./scrollTypes";
import type { ScrollVirtualizerAdapter } from "./virtualizerAdapter";

const PROGRAMMATIC_SCROLL_MIN_TTL_MS = 320;
const PROGRAMMATIC_SCROLL_MAX_TTL_MS = 1200;
const PROGRAMMATIC_SCROLL_MATCH_PX = 12;

const computeTtlMs = (distancePx: number): number =>
  Math.max(
    PROGRAMMATIC_SCROLL_MIN_TTL_MS,
    Math.min(
      PROGRAMMATIC_SCROLL_MAX_TTL_MS,
      PROGRAMMATIC_SCROLL_MIN_TTL_MS + Math.round(distancePx / 3),
    ),
  );

export interface DomScrollAdapterOptions {
  /**
   * Translate a row index to a pixel offset within the scroll container.
   * Provided by the caller because the adapter is virtualizer-agnostic.
   * If omitted, `scrollToIndex` is a no-op and logs a warning in debug mode.
   */
  resolveItemOffset?: (index: number) => number;
  /**
   * Optional total content size override. When omitted, the adapter reads
   * `element.scrollHeight`. Some virtualizers report a totalSize that's
   * slightly larger than scrollHeight while items are measuring; expose
   * this so the caller can pass the more accurate number when available.
   */
  resolveTotalSize?: () => number;
  /** Test seam for time. */
  now?: () => number;
}

export interface ProgrammaticScrollHandle {
  /**
   * Returns true if the given scrollTop value is within the TTL window of a
   * recent programmatic scroll. Used by the scroll-event bridge to filter
   * native scroll events triggered by adapter calls.
   */
  isProgrammaticScroll: (scrollTop: number) => boolean;
  /** Force-clear the pending programmatic flag. */
  clearProgrammaticFlag: () => void;
}

export interface DomScrollAdapter
  extends ScrollVirtualizerAdapter,
    ProgrammaticScrollHandle {}

/**
 * Build a DOM-based scroll adapter bound to a getter that returns the outer
 * element (or null). The element is read at call time, not at construction
 * time, so it's safe to build the adapter before mount. Using a getter
 * function rather than a React ref keeps this module framework-free and
 * sidesteps `react-hooks/refs` lint flagging "ref read during render".
 */
export function createDomScrollAdapter(
  getOuterElement: () => HTMLElement | null,
  options: DomScrollAdapterOptions = {},
): DomScrollAdapter {
  const now = options.now ?? Date.now;
  let pending: { offset: number; expiresAt: number } | null = null;

  const markProgrammatic = (targetOffset: number, currentOffset: number) => {
    const distance = Math.abs(targetOffset - currentOffset);
    pending = {
      offset: targetOffset,
      expiresAt: now() + computeTtlMs(distance),
    };
  };

  const getScrollElement = getOuterElement;

  const getTotalSize = (): number => {
    if (options.resolveTotalSize) return options.resolveTotalSize();
    const el = getOuterElement();
    return el?.scrollHeight ?? 0;
  };

  const getItemOffset = (index: number): number => {
    if (!options.resolveItemOffset) return 0;
    return options.resolveItemOffset(index);
  };

  const scrollToOffset = (offset: number, behavior: ScrollBehavior): void => {
    const el = getOuterElement();
    if (!el) return;
    const next = Math.max(0, Math.round(offset));
    markProgrammatic(next, el.scrollTop);
    el.scrollTo({ top: next, behavior: behavior === "smooth" ? "smooth" : "auto" });
  };

  const scrollToBottom = (behavior: ScrollBehavior): void => {
    const el = getOuterElement();
    if (!el) return;
    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    markProgrammatic(target, el.scrollTop);
    el.scrollTo({ top: target, behavior: behavior === "smooth" ? "smooth" : "auto" });
  };

  const scrollToIndex = (
    index: number,
    align: "start" | "center" | "end",
    behavior: ScrollBehavior,
  ): void => {
    const el = getOuterElement();
    if (!el || !options.resolveItemOffset) return;
    const itemTop = options.resolveItemOffset(index);
    const viewport = el.clientHeight;
    let target = itemTop;
    if (align === "end") target = Math.max(0, itemTop - viewport);
    else if (align === "center") target = Math.max(0, itemTop - viewport / 2);
    markProgrammatic(target, el.scrollTop);
    el.scrollTo({
      top: Math.round(target),
      behavior: behavior === "smooth" ? "smooth" : "auto",
    });
  };

  const isProgrammaticScroll = (scrollTop: number): boolean => {
    if (!pending) return false;
    if (now() > pending.expiresAt) {
      pending = null;
      return false;
    }
    if (Math.abs(scrollTop - pending.offset) <= PROGRAMMATIC_SCROLL_MATCH_PX) {
      // Reached the target: clear so subsequent scrolls count as user input.
      pending = null;
      return true;
    }
    // Still en route to a smooth-scroll target. Treat intermediate frames as
    // programmatic for the duration of the TTL.
    return true;
  };

  const clearProgrammaticFlag = () => {
    pending = null;
  };

  return {
    getScrollElement,
    getTotalSize,
    getItemOffset,
    scrollToOffset,
    scrollToBottom,
    scrollToIndex,
    isProgrammaticScroll,
    clearProgrammaticFlag,
  };
}
