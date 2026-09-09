import { clearAttachmentDownloadUrlCache } from "../../../hooks/useAttachmentDownloadUrl";
import { clearPreviewUrlCache } from "../../../hooks/useFilePreview";
import { invalidateThumbnailUrlCacheForConversation } from "../../../hooks/useBatchThumbnailUrl";
import { blobPreviewCache } from "../../../lib/blobPreviewCache";
import type { AppDispatch } from "../../../store";
import { chatApi } from "../../api/chatApi";
import {
  dispatchFileSourceInvalidated,
  type FileSourceInvalidationReason,
} from "../events/chatUiEvents";

const getConversationResourceTags = (conversationId: string) => [
  { type: "ConversationResources" as const, id: `${conversationId}-summary` },
  { type: "ConversationResources" as const, id: `${conversationId}-media` },
  { type: "ConversationResources" as const, id: `${conversationId}-files` },
  { type: "ConversationResources" as const, id: `${conversationId}-links` },
];

/**
 * A recalled/deleted message or a lost membership can make every signed source
 * in this conversation stale. RTK tags and thumbnail URLs are conversation-scoped;
 * preview/download/blob caches are conservatively reset before active viewers act.
 */
export const invalidateConversationFileResources = (
  dispatch: AppDispatch,
  conversationId: string,
  reason: FileSourceInvalidationReason,
): void => {
  if (!conversationId) return;

  dispatch(chatApi.util.invalidateTags(getConversationResourceTags(conversationId)));
  clearPreviewUrlCache();
  clearAttachmentDownloadUrlCache();
  invalidateThumbnailUrlCacheForConversation(conversationId);
  blobPreviewCache.clear();
  dispatchFileSourceInvalidated({ conversationId, reason });
};
