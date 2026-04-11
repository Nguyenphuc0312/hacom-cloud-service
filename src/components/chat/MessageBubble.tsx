import React from "react";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import { MessageCluster } from "./message-layout/MessageCluster";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  conversationType: Conversation["type"];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  isSelectionMode?: boolean;
  density?: ChatDensity;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  className?: string;
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = (props) => {
  return <MessageCluster {...props} />;
};

export const MessageBubble = React.memo(MessageBubbleComponent);

export default MessageBubble;
