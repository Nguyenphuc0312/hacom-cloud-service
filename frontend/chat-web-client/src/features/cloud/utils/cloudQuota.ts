import type { CloudQuota, CloudQuotaRequest } from "../types";

/** Show quota actions only when the user is close to, or has reached, a limit. */
export const QUOTA_WARNING_RATIO = 0.8;

export const shouldPromptQuotaRequest = (
  quota: CloudQuota | null | undefined,
  currentRequest: CloudQuotaRequest | null | undefined,
): boolean => {
  if (!quota || currentRequest?.status === "pending" || quota.limitBytes <= 0) {
    return false;
  }

  // usedBytes is authoritative and already includes active + trashed data.
  // Reserved bytes are included for the near-limit decision because an upload
  // already holding a reservation can consume the remaining headroom.
  const effectiveUsedBytes = Math.max(
    quota.usedBytes,
    quota.activeBytes + quota.trashBytes,
  ) + quota.reservedBytes;

  return (
    quota.availableBytes <= 0 ||
    effectiveUsedBytes / quota.limitBytes >= QUOTA_WARNING_RATIO
  );
};
