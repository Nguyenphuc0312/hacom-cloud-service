/**
 * Timeline V2 — Phase 1 wrapper.
 *
 * Drop-in replacement for `<MessageList>`: accepts the same props and
 * renders the legacy MessageList unchanged. Alongside, it mounts the V2
 * scroll owner with a no-op adapter so the state-machine and command-queue
 * dogfood real conversations under `VITE_CHAT_TIMELINE_V2_OWNER=true`.
 *
 * Why a wrapper instead of a fork:
 *   - No duplicated render logic in Phase 1; legacy bugs and V2 wiring stay
 *     visibly separate.
 *   - Debug logs (`VITE_CHAT_SCROLL_DEBUG=true`) let us compare V2 decisions
 *     to legacy behavior in real conversations before we cut over.
 *   - Rollback = flip the env flag; no redeploy of legacy code needed.
 *
 * Phase 2 will replace `<MessageList>` here with a V2-native renderer that
 * dispatches events into the owner instead of calling scrollTo* itself.
 */

import React from "react";
import { MessageList } from "../../../components/chat/MessageList";
import type { Conversation, Message, Attachment } from "../../../types";
import type { ChatDensity } from "../../../stores/uiStore";
import type { ChatLayoutState } from "../../../utils/densityPolicy";
import type { UnreadTimelineMarker } from "../../../hooks/useMessageGrouping";
import { useConversationMessagesRTK } from "../hooks/useConversationMessagesRTK";
import { useChatScrollOwnerV2 } from "./useChatScrollOwnerV2";
import { debugScroll, isChatScrollDebugEnabled } from "./scrollDebug";

/**
 * Public props are an exact superset of the legacy MessageList props so a
 * caller can flip from `<MessageList .../>` to `<ChatTimelineV2 .../>` with
 * a single substitution.
 */
export interface ChatTimelineV2Props {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  historyLoadingState?: {
    stage:
      | "empty"
      | "partial_unread_bootstrap"
      | "partial_prefetch"
      | "authoritative_initial_window"
      | "paginating_older"
      | "live_realtime";
    isPartial: boolean;
  } | null;
  onLoadMore?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  density?: ChatDensity;
  layoutState: ChatLayoutState;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  unreadRestoreSignature?: string | null;
  onUnreadRestoreConsumed?: (signature: string) => void;
  onReachedLatest?: (latestMessage: Message) => void;
  jumpToMessageId?: string | null;
  jumpRequestVersion?: number;
  onJumpHandled?: (messageId: string) => void;
  composerHeight?: number;
  className?: string;
}

export const ChatTimelineV2: React.FC<ChatTimelineV2Props> = (props) => {
  const { conversationId, currentUserId, isInitialLoading: parentIsInitialLoading } = props;

  // RTK Query dedupes by query key, so calling the same hook from both
  // ChatTimelineV2 and MessageList does NOT trigger a duplicate fetch.
  const {
    messages,
    hasMoreOlder,
    isFetching,
    loadOlder,
  } = useConversationMessagesRTK(conversationId);

  const owner = useChatScrollOwnerV2({
    conversationId,
    currentUserId,
    messages,
    isInitialLoading: Boolean(parentIsInitialLoading),
    isFetchingOlder: isFetching,
    hasOlder: hasMoreOlder,
    loadOlder,
  });

  React.useEffect(() => {
    if (!isChatScrollDebugEnabled()) return;
    debugScroll("bottom_state_change", {
      state: owner.state,
      isPinnedToBottom: owner.isPinnedToBottom,
      pendingNewMessages: owner.pendingNewMessages,
    });
  }, [owner.state, owner.isPinnedToBottom, owner.pendingNewMessages]);

  return <MessageList {...props} />;
};

ChatTimelineV2.displayName = "ChatTimelineV2";

export default ChatTimelineV2;
