export const PINNED_TO_BOTTOM_THRESHOLD_PX = 24;

export const getDistanceFromBottom = (element: HTMLElement): number =>
  Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);

export const isPinnedToBottom = (
  distanceFromBottomPx: number,
  thresholdPx: number = PINNED_TO_BOTTOM_THRESHOLD_PX,
): boolean => distanceFromBottomPx <= thresholdPx;

export const resolvePinnedToBottom = (
  element: HTMLElement,
  thresholdPx: number = PINNED_TO_BOTTOM_THRESHOLD_PX,
): {
  distanceFromBottomPx: number;
  isPinnedToBottom: boolean;
} => {
  const distanceFromBottomPx = getDistanceFromBottom(element);

  return {
    distanceFromBottomPx,
    isPinnedToBottom: isPinnedToBottom(distanceFromBottomPx, thresholdPx),
  };
};
