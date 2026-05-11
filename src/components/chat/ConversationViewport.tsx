import React from "react";
import type { Attachment, Conversation, Message } from "../../types";
import { MessageList } from "./MessageList";
import {
  isChatSimpleVirtualTimelineEnabled,
  isChatUseLegacyTimelineEnabled,
} from "../../features/chat/config/experienceFlags";
import { SimpleVirtualizedChatTimeline } from "../../features/chat/simple-virtual-timeline";
import { useConversationMessagesRTK } from "../../features/chat/hooks/useConversationMessagesRTK";
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

      // Production decision tree (post-cleanup 2026-05):
      //   default                           → SimpleVirtualizedChatTimeline
      //   VITE_CHAT_USE_LEGACY_TIMELINE=true → legacy MessageList (rollback)
      //
      // V2 owner / drives / bridge are GONE from this decision tree. The
      // V2 module lives under timeline-v2/__deprecated__ and must not be
      // imported here. Routing reads flags per-render so devtools /
      // Playwright overrides flip without a remount-from-scratch.
      const useLegacy =
        isChatUseLegacyTimelineEnabled() ||
        !isChatSimpleVirtualTimelineEnabled();

      if (!useLegacy) {
        return (
          <SimpleTimelineSlot
            conversationId={conversation.id}
            conversationType={conversation.type}
            currentUserId={currentUserId}
            onReply={onReply}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            onInspect={onInspect}
            onImageClick={onImageClick}
            onFilePreview={onFilePreview}
            density={density}
            layoutState={layoutState}
            isSelectionMode={isSelectionMode}
            selectedMessageIds={selectedMessageIds}
            onToggleSelect={onToggleSelect}
            onNavigateToMessage={onNavigateToMessage}
            currentUsername={currentUsername}
            unreadMarker={unreadMarker}
            composerHeight={composerHeight}
            className={className}
          />
        );
      }

      // Emergency rollback. MessageList retains its own scroll behavior
      // (no bridge, no suppress) — those props were stripped during the
      // 2026-05 cleanup.
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
          isLoadingMore={Boolean(isLoadingMessages)}
          isInitialLoading={Boolean(
            isLoadingMessages || !isConversationReady
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

/**
 * Bridges the RTK message query into SimpleVirtualizedChatTimeline so that
 * ConversationViewport's outer contract (no `messages` prop) stays the
 * same. Kept as a thin slot so the simple timeline never has to care about
 * RTK plumbing during tests.
 */
interface SimpleTimelineSlotProps {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density: ChatDensity;
  layoutState: ChatLayoutState;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker:
    | {
        lastReadMessageId?: string;
        lastReadAt?: Date | string;
        firstUnreadMessageId?: string;
        active?: boolean;
      }
    | null;
  composerHeight?: number;
  className?: string;
}

const SimpleTimelineSlot: React.FC<SimpleTimelineSlotProps> = (props) => {
  const {
    messages,
    hasMoreOlder,
    isInitialLoading,
    isLoadingOlder,
    loadOlder,
  } = useConversationMessagesRTK(props.conversationId);
  return (
    <SimpleVirtualizedChatTimeline
      conversationId={props.conversationId}
      conversationType={props.conversationType}
      currentUserId={props.currentUserId}
      messages={messages}
      onReply={props.onReply}
      onReact={props.onReact}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
      onInspect={props.onInspect}
      onImageClick={props.onImageClick}
      onFilePreview={props.onFilePreview}
      hasMore={hasMoreOlder}
      isLoadingMore={isLoadingOlder}
      isInitialLoading={isInitialLoading}
      onLoadMore={loadOlder}
      density={props.density}
      layoutState={props.layoutState}
      isSelectionMode={props.isSelectionMode}
      selectedMessageIds={props.selectedMessageIds}
      onToggleSelect={props.onToggleSelect}
      onNavigateToMessage={props.onNavigateToMessage}
      currentUsername={props.currentUsername}
      unreadMarker={props.unreadMarker}
      composerHeight={props.composerHeight}
      className={props.className}
    />
  );
};

export default ConversationViewport;
