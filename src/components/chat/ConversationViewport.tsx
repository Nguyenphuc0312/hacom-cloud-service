import React from "react";
import type { Attachment, Conversation, Message } from "../../types";
import { useConversationMessageCount } from "../../stores";
import { MessageList } from "./MessageList";
import type { ChatDensity } from "../../stores/uiStore";
import type { ChatLayoutState } from "../../utils/densityPolicy";

interface ConversationViewportProps {
  layoutState: ChatLayoutState;
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
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
  isConversationReady?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  messageError?: string | null;
  onRetryMessages?: () => void | Promise<void>;
  density: ChatDensity;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  onReachedLatest?: (message: Message) => void;
  jumpToMessageId?: string | null;
  jumpRequestVersion?: number;
  onJumpHandled?: (messageId: string) => void;
  composerHeight?: number;
  className?: string;
}

export const ConversationViewport: React.FC<ConversationViewportProps> =
  React.memo(
    ({
      layoutState,
      conversation,
      currentUserId,
      onReply,
      onReact,
      onEdit,
      onDelete,
      onInspect,
      hasMoreMessages,
      isLoadingMessages,
      historyLoadingState,
      isConversationReady,
      onLoadOlderMessages,
      onImageClick,
      onFilePreview,
      messageError,
      onRetryMessages,
      density,
      isSelectionMode,
      selectedMessageIds,
      onToggleSelect,
      onNavigateToMessage,
      currentUsername,
      onReachedLatest,
      jumpToMessageId,
      jumpRequestVersion,
      onJumpHandled,
      composerHeight,
      className,
    }: ConversationViewportProps) => {
      const messageCount = useConversationMessageCount(conversation.id);
      const conversationReadSnapshot = conversation as Conversation & {
        lastReadMessageId?: string;
        lastReadAt?: Date | string;
        firstUnreadMessageId?: string;
      };
      const lastReadMessageId = conversationReadSnapshot.lastReadMessageId;
      const lastReadAt = conversationReadSnapshot.lastReadAt;
      const firstUnreadMessageId = conversationReadSnapshot.firstUnreadMessageId;

      const [unreadMarker, setUnreadMarker] = React.useState<{
        lastReadMessageId?: string;
        lastReadAt?: Date | string;
        firstUnreadMessageId?: string;
        active?: boolean;
      } | null>(null);

      React.useEffect(() => {
        const hasUnreadContext =
          (conversation.unreadCount ?? 0) > 0 &&
          (firstUnreadMessageId || lastReadMessageId || lastReadAt);

        if (!hasUnreadContext) {
          setUnreadMarker(null);
          return;
        }

        setUnreadMarker({
          lastReadMessageId,
          lastReadAt,
          firstUnreadMessageId,
          active: true,
        });
      }, [
        conversation.unreadCount,
        firstUnreadMessageId,
        lastReadAt,
        lastReadMessageId,
      ]);

      const handleReachedLatest = React.useCallback(
        (message: Message) => {
          setUnreadMarker((current) => (current ? null : current));
          onReachedLatest?.(message);
        },
        [onReachedLatest],
      );

      return (
        <MessageList
          conversationId={conversation.id}
          conversationType={conversation.type}
          currentUserId={currentUserId}
          onReply={onReply}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          onInspect={onInspect}
          hasMore={hasMoreMessages}
          isLoadingMore={Boolean(isLoadingMessages && messageCount > 0)}
          isInitialLoading={Boolean(
            (isLoadingMessages || !isConversationReady) && messageCount === 0
          )}
          historyLoadingState={historyLoadingState}
          onLoadMore={onLoadOlderMessages}
          onImageClick={onImageClick}
          onFilePreview={onFilePreview}
          error={messageError}
          onRetry={onRetryMessages}
          density={density}
          layoutState={layoutState}
          isSelectionMode={isSelectionMode}
          selectedMessageIds={selectedMessageIds}
          onToggleSelect={onToggleSelect}
          onNavigateToMessage={onNavigateToMessage}
          currentUsername={currentUsername}
          unreadMarker={unreadMarker}
          onReachedLatest={handleReachedLatest}
          jumpToMessageId={jumpToMessageId}
          jumpRequestVersion={jumpRequestVersion}
          onJumpHandled={onJumpHandled}
          composerHeight={composerHeight}
          className={className}
        />
      );
    },
  );

ConversationViewport.displayName = "ConversationViewport";

export default ConversationViewport;
