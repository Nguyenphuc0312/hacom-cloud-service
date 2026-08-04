import type { TypingStatus } from "../types";

const TYPING_ACTIVITY_PRIORITY = {
  recording: 3,
  uploading: 2,
  typing: 1,
  online: 0,
} as const;

export const upsertTypingStatus = (
  typingStatuses: TypingStatus[],
  status: TypingStatus,
): TypingStatus[] => {
  const existingIndex = typingStatuses.findIndex(
    (typing) =>
      typing.conversationId === status.conversationId &&
      typing.userId === status.userId,
  );

  if (existingIndex < 0) {
    return [...typingStatuses, status];
  }

  return typingStatuses.map((typing, index) =>
    index === existingIndex ? status : typing,
  );
};

export const removeTypingStatus = (
  typingStatuses: TypingStatus[],
  conversationId: string,
  userId: string,
): TypingStatus[] =>
  typingStatuses.filter(
    (typing) =>
      !(
        typing.conversationId === conversationId && typing.userId === userId
      ),
  );

export const removeConversationTypingStatuses = (
  typingStatuses: TypingStatus[],
  conversationId: string,
): TypingStatus[] =>
  typingStatuses.filter((typing) => typing.conversationId !== conversationId);

export const selectCurrentTypingStatusFromState = ({
  selectedConversationId,
  typingStatuses,
}: {
  selectedConversationId: string | null;
  typingStatuses: TypingStatus[];
}): TypingStatus | null => {
  if (!selectedConversationId) return null;

  return (
    typingStatuses
      .filter(
        (typing) =>
          typing.conversationId === selectedConversationId && typing.isTyping,
      )
      .sort((a, b) => {
        const priorityDiff =
          (TYPING_ACTIVITY_PRIORITY[b.activity || "typing"] ?? 1) -
          (TYPING_ACTIVITY_PRIORITY[a.activity || "typing"] ?? 1);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      })[0] ?? null
  );
};

export const selectCurrentTypingStatusesFromState = ({
  selectedConversationId,
  typingStatuses,
}: {
  selectedConversationId: string | null;
  typingStatuses: TypingStatus[];
}): TypingStatus[] => {
  if (!selectedConversationId) return [];

  return typingStatuses
    .filter(
      (typing) =>
        typing.conversationId === selectedConversationId && typing.isTyping,
    )
    .sort((a, b) => {
      const priorityDiff =
        (TYPING_ACTIVITY_PRIORITY[b.activity || "typing"] ?? 1) -
        (TYPING_ACTIVITY_PRIORITY[a.activity || "typing"] ?? 1);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
};
