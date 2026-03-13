export type ScrollFollowMode =
  | "following"
  | "detached"
  | "buffering"
  | "prepending";

export interface ScrollMetricsSnapshot {
  distanceFromBottomPx: number;
  clientHeightPx: number;
  velocityPxPerMs: number;
  lastInteractionAgeMs: number;
}

export interface AutoScrollDecisionInput extends ScrollMetricsSnapshot {
  currentMode: ScrollFollowMode;
  appendedCount: number;
  pendingBufferedCount: number;
  latestIsOwnMessage: boolean;
  isStreaming?: boolean;
}

export interface AutoScrollDecision {
  action: "follow" | "buffer";
  behavior: ScrollBehavior;
  nextMode: ScrollFollowMode;
  nearBottomThresholdPx: number;
  reason:
    | "explicit_follow"
    | "own_message"
    | "near_bottom"
    | "stream_follow"
    | "reading_history";
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const computeNearBottomThreshold = ({
  clientHeightPx,
  pendingBufferedCount,
}: {
  clientHeightPx: number;
  pendingBufferedCount: number;
}): number => {
  const baseThreshold = clientHeightPx > 0 ? clientHeightPx * 0.12 : 96;
  return clamp(baseThreshold + pendingBufferedCount * 4, 40, 160);
};

export const computeDetachThreshold = ({
  nearBottomThresholdPx,
  clientHeightPx,
}: {
  nearBottomThresholdPx: number;
  clientHeightPx: number;
}): number => {
  const extraSlack = clientHeightPx > 0 ? clientHeightPx * 0.08 : 48;
  return clamp(
    nearBottomThresholdPx + extraSlack,
    nearBottomThresholdPx + 24,
    nearBottomThresholdPx + 96,
  );
};

const isReadingHistory = ({
  distanceFromBottomPx,
  nearBottomThresholdPx,
  velocityPxPerMs,
  lastInteractionAgeMs,
}: ScrollMetricsSnapshot & { nearBottomThresholdPx: number }): boolean =>
  distanceFromBottomPx > nearBottomThresholdPx * 1.5 &&
  (velocityPxPerMs < -0.08 || lastInteractionAgeMs < 2200);

export const decideAutoScroll = (
  input: AutoScrollDecisionInput,
): AutoScrollDecision => {
  const nearBottomThresholdPx = computeNearBottomThreshold({
    clientHeightPx: input.clientHeightPx,
    pendingBufferedCount: input.pendingBufferedCount,
  });

  if (input.latestIsOwnMessage) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      nearBottomThresholdPx,
      reason: "own_message",
    };
  }

  if (
    input.currentMode === "following" &&
    input.isStreaming
  ) {
    return {
      action: "follow",
      behavior: "auto",
      nextMode: "following",
      nearBottomThresholdPx,
      reason: "stream_follow",
    };
  }

  if (input.distanceFromBottomPx <= nearBottomThresholdPx) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      nearBottomThresholdPx,
      reason: "near_bottom",
    };
  }

  const detachThresholdPx = computeDetachThreshold({
    nearBottomThresholdPx,
    clientHeightPx: input.clientHeightPx,
  });
  if (
    input.currentMode === "following" &&
    input.distanceFromBottomPx <= detachThresholdPx
  ) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      nearBottomThresholdPx,
      reason: "near_bottom",
    };
  }

  if (
    isReadingHistory({
      ...input,
      nearBottomThresholdPx,
    })
  ) {
    return {
      action: "buffer",
      behavior: "auto",
      nextMode: "buffering",
      nearBottomThresholdPx,
      reason: "reading_history",
    };
  }

  return {
    action: "buffer",
    behavior: "auto",
    nextMode: "detached",
    nearBottomThresholdPx,
    reason: "reading_history",
  };
};

export const deriveFollowModeFromScroll = ({
  distanceFromBottomPx,
  clientHeightPx,
  velocityPxPerMs,
  pendingBufferedCount,
  currentMode,
}: {
  distanceFromBottomPx: number;
  clientHeightPx: number;
  velocityPxPerMs: number;
  pendingBufferedCount: number;
  currentMode: ScrollFollowMode;
}): {
  isNearBottom: boolean;
  nearBottomThresholdPx: number;
  nextMode: ScrollFollowMode;
} => {
  const nearBottomThresholdPx = computeNearBottomThreshold({
    clientHeightPx,
    pendingBufferedCount,
  });
  const isNearBottom = distanceFromBottomPx <= nearBottomThresholdPx;
  const detachThresholdPx = computeDetachThreshold({
    nearBottomThresholdPx,
    clientHeightPx,
  });

  if (isNearBottom) {
    return {
      isNearBottom,
      nearBottomThresholdPx,
      nextMode: "following",
    };
  }

  if (
    currentMode === "following" &&
    distanceFromBottomPx <= detachThresholdPx
  ) {
    return {
      isNearBottom: false,
      nearBottomThresholdPx,
      nextMode: "following",
    };
  }

  return {
    isNearBottom: false,
    nearBottomThresholdPx,
    nextMode: velocityPxPerMs < -0.05 ? "detached" : "buffering",
  };
};
