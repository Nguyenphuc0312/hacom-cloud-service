export type MessageVerticalBounds = {
  id: string;
  top: number;
  bottom: number;
};

/** Resolve the message row at the pointer's vertical position, independent of bubble width. */
export const resolveMessageIdAtY = (
  bounds: readonly MessageVerticalBounds[],
  clientY: number,
): string | undefined => {
  const matches = bounds.filter(
    (candidate) =>
      Number.isFinite(candidate.top) &&
      Number.isFinite(candidate.bottom) &&
      candidate.bottom >= candidate.top &&
      clientY >= candidate.top &&
      clientY <= candidate.bottom,
  );

  matches.sort((left, right) => {
    const leftCenter = (left.top + left.bottom) / 2;
    const rightCenter = (right.top + right.bottom) / 2;
    return Math.abs(leftCenter - clientY) - Math.abs(rightCenter - clientY);
  });

  return matches[0]?.id;
};

export const shouldShowCloudSelectionToolbar = (
  isSelectionMode: boolean,
  selectedCount: number,
): boolean => isSelectionMode && selectedCount > 0;
