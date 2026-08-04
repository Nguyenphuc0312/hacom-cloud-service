export type SummaryActiveDeltaReason =
  | "summary-last-message-missing-from-active-cache"
  | "summary-without-last-message-id";

export interface SummaryActiveDeltaInput {
  activeConversationId: string | null;
  eventConversationId: string;
  hasUsableLastMessageId: boolean;
  hasMessageInCache: boolean;
}

export interface SummaryActiveDeltaDecision {
  isActive: boolean;
  shouldSync: boolean;
  reason: SummaryActiveDeltaReason | null;
}

export const decideSummaryActiveDeltaSync = ({
  activeConversationId,
  eventConversationId,
  hasUsableLastMessageId,
  hasMessageInCache,
}: SummaryActiveDeltaInput): SummaryActiveDeltaDecision => {
  const isActive = activeConversationId === eventConversationId;
  if (!isActive) {
    return { isActive, shouldSync: false, reason: null };
  }

  if (!hasUsableLastMessageId) {
    return {
      isActive,
      shouldSync: true,
      reason: "summary-without-last-message-id",
    };
  }

  if (!hasMessageInCache) {
    return {
      isActive,
      shouldSync: true,
      reason: "summary-last-message-missing-from-active-cache",
    };
  }

  return { isActive, shouldSync: false, reason: null };
};
