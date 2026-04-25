import { CHAT_SCROLL_MACHINE_V2_ENABLED } from "../features/chat/config/experienceFlags";

export type ScrollMode =
  | "at_bottom"
  | "near_bottom"
  | "reading_history"
  | "prepending_history"
  | "receiving_new_message"
  | "sending_own_message"
  | "jump_to_message";

export const PINNED_TO_BOTTOM_ENTER_THRESHOLD_PX = 24;
export const PINNED_TO_BOTTOM_LEAVE_THRESHOLD_PX = 80;
export const PINNED_TO_BOTTOM_THRESHOLD_PX = 24;

export const getDistanceFromBottom = (element: HTMLElement): number =>
  Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);

export const isPinnedToBottom = (
  distanceFromBottomPx: number,
  thresholdPx: number = PINNED_TO_BOTTOM_THRESHOLD_PX,
): boolean => distanceFromBottomPx <= thresholdPx;

interface ResolvePinnedStateOptions {
  previouslyPinnedToBottom?: boolean;
}

export const resolvePinnedToBottom = (
  element: HTMLElement,
  thresholdPx: number = PINNED_TO_BOTTOM_THRESHOLD_PX,
  options?: ResolvePinnedStateOptions,
): {
  distanceFromBottomPx: number;
  isPinnedToBottom: boolean;
  mode: Extract<ScrollMode, "at_bottom" | "near_bottom" | "reading_history">;
} => {
  const distanceFromBottomPx = getDistanceFromBottom(element);
  if (!CHAT_SCROLL_MACHINE_V2_ENABLED) {
    return {
      distanceFromBottomPx,
      isPinnedToBottom: isPinnedToBottom(distanceFromBottomPx, thresholdPx),
      mode:
        distanceFromBottomPx <= thresholdPx ? "at_bottom" : "reading_history",
    };
  }

  const nextPinnedToBottom = options?.previouslyPinnedToBottom
    ? distanceFromBottomPx < PINNED_TO_BOTTOM_LEAVE_THRESHOLD_PX
    : distanceFromBottomPx <= PINNED_TO_BOTTOM_ENTER_THRESHOLD_PX;

  const mode: Extract<ScrollMode, "at_bottom" | "near_bottom" | "reading_history"> =
    distanceFromBottomPx <= PINNED_TO_BOTTOM_ENTER_THRESHOLD_PX
      ? "at_bottom"
      : distanceFromBottomPx < PINNED_TO_BOTTOM_LEAVE_THRESHOLD_PX
        ? "near_bottom"
        : "reading_history";

  return {
    distanceFromBottomPx,
    isPinnedToBottom: nextPinnedToBottom,
    mode,
  };
};
