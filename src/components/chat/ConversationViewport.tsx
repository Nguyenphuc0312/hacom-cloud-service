import React from "react";
import type { Attachment, Conversation, Message } from "../../types";
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
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  isConversationReady?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density: ChatDensity;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
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
      isConversationReady,
      onImageClick,
      onFilePreview,
      density,
      isSelectionMode,
      selectedMessageIds,
      onToggleSelect,
      onNavigateToMessage,
      currentUsername,
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

      const {
        messages,
        hasMoreOlder,
        isInitialLoading,
        isLoadingOlder,
        loadOlder,
      } = useConversationMessagesRTK(conversation.id);

      return (
        <SimpleVirtualizedChatTimeline
          conversationId={conversation.id}
          conversationType={conversation.type}
          currentUserId={currentUserId}
          messages={messages}
          onReply={onReply}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          onInspect={onInspect}
          onImageClick={onImageClick}
          onFilePreview={onFilePreview}
          hasMore={hasMoreOlder}
          isLoadingMore={isLoadingOlder}
          isInitialLoading={isInitialLoading || !isConversationReady}
          onLoadMore={loadOlder}
          density={density}
          layoutState={layoutState}
          isSelectionMode={isSelectionMode}
          selectedMessageIds={selectedMessageIds}
          onToggleSelect={onToggleSelect}
          onNavigateToMessage={onNavigateToMessage}
          currentUsername={currentUsername}
          viewerCanRecallOthers={
            Boolean(
              conversation.createdBy &&
                conversation.createdBy === currentUserId,
            )
          }
          unreadMarker={unreadMarker}
          composerHeight={composerHeight}
          className={className}
        />
      );
    },
  );

ConversationViewport.displayName = "ConversationViewport";

export default ConversationViewport;
