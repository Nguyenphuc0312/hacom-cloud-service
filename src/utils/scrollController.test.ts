import { describe, expect, it } from "vitest";

import { resolvePinnedToBottom } from "./scrollController";

const makeElement = (
  distanceFromBottomPx: number,
): HTMLElement =>
  ({
    scrollHeight: 1_200,
    clientHeight: 400,
    scrollTop: 1_200 - 400 - distanceFromBottomPx,
  }) as HTMLElement;

describe("scrollController", () => {
  it("pins a detached reader again only once they are within the enter threshold", () => {
    const result = resolvePinnedToBottom(makeElement(24), undefined, {
      previouslyPinnedToBottom: false,
    });

    expect(result.isPinnedToBottom).toBe(true);
    expect(result.mode).toBe("at_bottom");
  });

  it("keeps a near-bottom reader pinned while within the leave threshold", () => {
    const result = resolvePinnedToBottom(makeElement(72), undefined, {
      previouslyPinnedToBottom: true,
    });

    expect(result.isPinnedToBottom).toBe(true);
    expect(result.mode).toBe("near_bottom");
  });

  it("does not auto-pin a reader who is only near the bottom after detaching", () => {
    const result = resolvePinnedToBottom(makeElement(72), undefined, {
      previouslyPinnedToBottom: false,
    });

    expect(result.isPinnedToBottom).toBe(false);
    expect(result.mode).toBe("near_bottom");
  });

  it("detaches once the reader moves beyond the leave threshold", () => {
    const result = resolvePinnedToBottom(makeElement(81), undefined, {
      previouslyPinnedToBottom: true,
    });

    expect(result.isPinnedToBottom).toBe(false);
    expect(result.mode).toBe("reading_history");
  });
});
