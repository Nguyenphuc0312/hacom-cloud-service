import type { Conversation } from "../../../types";
import {
  getConversationDisplayName,
  getOtherParticipant,
} from "../../../utils/messageHelpers";

type PreferredNameResolver = (userId: string) => string | null | undefined;

/**
 * Resolve the place a search result belongs to. Direct conversations use the
 * viewer's local friend alias; groups keep their canonical conversation name.
 */
export const getSearchConversationDisplayName = (
  conversation: Conversation,
  currentUserId: string,
  resolvePreferredName: PreferredNameResolver,
): string => {
  const directPartnerId = getOtherParticipant(conversation, currentUserId)?.id;
  const preferredName = directPartnerId
    ? resolvePreferredName(directPartnerId)?.trim()
    : "";

  return (
    preferredName || getConversationDisplayName(conversation, currentUserId)
  );
};
