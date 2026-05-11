/**
 * Timeline V2 — narrow adapter the scroll owner uses to talk to whatever
 * virtualizer (or plain DOM scroller) is rendering the messages.
 *
 * Phase 1 keeps this minimal: just enough to execute scroll commands. The
 * legacy MessageList does NOT implement this — Phase 2 will provide a real
 * adapter and refactor MessageList to dispatch events instead of scrolling
 * itself.
 */

import type { ScrollBehavior } from "./scrollTypes";

export interface ScrollVirtualizerAdapter {
  /** Returns the scroll viewport element (may be null before mount). */
  getScrollElement: () => HTMLElement | null;
  /** Total scrollable height in CSS pixels. */
  getTotalSize: () => number;
  /** Resolve the y-offset of a virtualized row by index. */
  getItemOffset: (index: number) => number;
  /** Imperative scroll calls. The adapter MUST flag them as programmatic. */
  scrollToOffset: (offset: number, behavior: ScrollBehavior) => void;
  scrollToBottom: (behavior: ScrollBehavior) => void;
  scrollToIndex: (
    index: number,
    align: "start" | "center" | "end",
    behavior: ScrollBehavior,
  ) => void;
}

/** A no-op adapter for tests and for the Phase 1 wrapper. */
export const createNoopAdapter = (): ScrollVirtualizerAdapter => ({
  getScrollElement: () => null,
  getTotalSize: () => 0,
  getItemOffset: () => 0,
  scrollToOffset: () => {},
  scrollToBottom: () => {},
  scrollToIndex: () => {},
});
