const FAST_POLL_DELAY_MS = 5000;
const SLOW_POLL_DELAY_MS = 15000;
const FAST_POLL_ATTEMPTS = 6;
const MAX_AUTO_POLL_ATTEMPTS = 10;
const MIN_DELAY_MS = 2000;

export const getMaxAutoThumbnailPollAttempts = (): number =>
  MAX_AUTO_POLL_ATTEMPTS;

export const getThumbnailPollDelayMs = (
  attempt: number,
  serverRetryAfterMs: number | null | undefined,
): number => {
  const phaseDelay =
    attempt < FAST_POLL_ATTEMPTS ? FAST_POLL_DELAY_MS : SLOW_POLL_DELAY_MS;
  const requestedDelay =
    typeof serverRetryAfterMs === "number" && serverRetryAfterMs > 0
      ? serverRetryAfterMs
      : phaseDelay;

  const maxDelay =
    attempt < FAST_POLL_ATTEMPTS ? FAST_POLL_DELAY_MS : SLOW_POLL_DELAY_MS;
  return Math.min(Math.max(requestedDelay, MIN_DELAY_MS), maxDelay);
};

export const shouldContinueThumbnailPolling = (attempt: number): boolean =>
  attempt < MAX_AUTO_POLL_ATTEMPTS;
