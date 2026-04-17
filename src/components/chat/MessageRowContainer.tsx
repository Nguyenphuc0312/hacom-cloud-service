import React from "react";
import type { Attachment, Message } from "../../types";
import { useMessageEntity } from "../../stores";
import type { ChatDensity } from "../../stores/uiStore";
import type { LongMessageRenderMode } from "../../utils/longMessagePolicy";
import { MessageItem } from "./MessageItem";
import type { ConversationTimelineItem } from "../../features/chat/hooks/useConversationTimelineRows";

type TimelineMessageLikeItem = Extract<
  ConversationTimelineItem,
  { kind: "message" | "system" }
>;

interface MessageRowContainerProps {
  item: TimelineMessageLikeItem;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density?: ChatDensity;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;
  onToggleTextExpand?: () => void;
  shouldAnimateInsert?: boolean;
}

const MessageRowContainerComponent: React.FC<MessageRowContainerProps> = (
  props,
) => {
  const message = useMessageEntity(props.item.messageId) ?? props.item.message;

  return <MessageItem {...props} message={message} />;
};

export const MessageRowContainer = React.memo(MessageRowContainerComponent);

export default MessageRowContainer;
