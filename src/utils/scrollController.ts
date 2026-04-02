export type ScrollFollowMode = "following" | "detached";

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
  atBottomThresholdPx: number;
  detachThresholdPx: number;
  reason:
    | "own_message"
    | "at_bottom"
    | "within_hysteresis"
    | "stream_follow"
    | "reading_history";
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const computeAtBottomThreshold = ({
  clientHeightPx,
  pendingBufferedCount,
}: {
  clientHeightPx: number;
  pendingBufferedCount: number;
}): number => {
  const baseThreshold = clientHeightPx > 0 ? clientHeightPx * 0.08 : 48;
  return clamp(baseThreshold + pendingBufferedCount * 2, 24, 72);
};

export const computeDetachThreshold = ({
  atBottomThresholdPx,
  clientHeightPx,
}: {
  atBottomThresholdPx: number;
  clientHeightPx: number;
}): number => {
  const extraSlack = clientHeightPx > 0 ? clientHeightPx * 0.06 : 32;
  return clamp(
    atBottomThresholdPx + extraSlack,
    atBottomThresholdPx + 24,
    atBottomThresholdPx + 56,
  );
};

const isReadingHistory = ({
  distanceFromBottomPx,
  detachThresholdPx,
  velocityPxPerMs,
  lastInteractionAgeMs,
}: ScrollMetricsSnapshot & { detachThresholdPx: number }): boolean =>
  distanceFromBottomPx > detachThresholdPx &&
  (velocityPxPerMs < -0.05 || lastInteractionAgeMs < 2000);

export const decideAutoScroll = (
  input: AutoScrollDecisionInput,
): AutoScrollDecision => {
  const atBottomThresholdPx = computeAtBottomThreshold({
    clientHeightPx: input.clientHeightPx,
    pendingBufferedCount: input.pendingBufferedCount,
  });
  const detachThresholdPx = computeDetachThreshold({
    atBottomThresholdPx,
    clientHeightPx: input.clientHeightPx,
  });

  if (input.latestIsOwnMessage) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "own_message",
    };
  }

  if (input.currentMode !== "following") {
    return {
      action: "buffer",
      behavior: "auto",
      nextMode: "detached",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "reading_history",
    };
  }

  if (input.currentMode === "following" && input.isStreaming) {
    return {
      action: "follow",
      behavior: "auto",
      nextMode: "following",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "stream_follow",
    };
  }

  if (input.distanceFromBottomPx <= atBottomThresholdPx) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "at_bottom",
    };
  }

  if (
    input.currentMode === "following" &&
    input.distanceFromBottomPx <= detachThresholdPx
  ) {
    return {
      action: "follow",
      behavior: input.appendedCount > 1 ? "auto" : "smooth",
      nextMode: "following",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "within_hysteresis",
    };
  }

  if (
    isReadingHistory({
      ...input,
      detachThresholdPx,
    })
  ) {
    return {
      action: "buffer",
      behavior: "auto",
      nextMode: "detached",
      atBottomThresholdPx,
      detachThresholdPx,
      reason: "reading_history",
    };
  }

  return {
    action: "buffer",
    behavior: "auto",
    nextMode: "detached",
    atBottomThresholdPx,
    detachThresholdPx,
    reason: "reading_history",
  };
};

export const deriveFollowModeFromScroll = ({
  distanceFromBottomPx,
  clientHeightPx,
  pendingBufferedCount,
}: {
  distanceFromBottomPx: number;
  clientHeightPx: number;
  velocityPxPerMs: number;
  pendingBufferedCount: number;
  currentMode: ScrollFollowMode;
}): {
  isAtBottom: boolean;
  atBottomThresholdPx: number;
  detachThresholdPx: number;
  nextMode: ScrollFollowMode;
} => {
  const atBottomThresholdPx = computeAtBottomThreshold({
    clientHeightPx,
    pendingBufferedCount,
  });
  const isAtBottom = distanceFromBottomPx <= atBottomThresholdPx;
  const detachThresholdPx = computeDetachThreshold({
    atBottomThresholdPx,
    clientHeightPx,
  });

  if (isAtBottom) {
    return {
      isAtBottom,
      atBottomThresholdPx,
      detachThresholdPx,
      nextMode: "following",
    };
  }

  return {
    isAtBottom: false,
    atBottomThresholdPx,
    detachThresholdPx,
    nextMode: "detached",
  };
};
