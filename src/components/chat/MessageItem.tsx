import React from "react";
import clsx from "clsx";
import { DateDivider } from "./DateDivider";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "../message/SystemMessage";
import type { Message } from "../../types";
import type { TimelineItem } from "../../hooks/useMessageGrouping";

interface MessageItemProps {
  item: TimelineItem;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
}

const MessageItemComponent: React.FC<MessageItemProps> = ({
  item,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onImageClick,
}) => {
  if (item.kind === "date") {
    return <DateDivider date={item.date} />;
  }

  if (item.kind === "system") {
    return <SystemMessage message={item.message} className="my-2" />;
  }

  return (
    <div className={clsx(item.isGroupEnd ? "mb-1.5" : "mb-0.5")}>
      <MessageBubble
        message={item.message}
        isOwn={item.isOwn}
        showAvatar={item.showAvatar}
        showSenderName={item.showSenderName}
        isGroupStart={item.isGroupStart}
        isGroupEnd={item.isGroupEnd}
        conversationType={item.conversationType}
        onReply={onReply}
        onReact={onReact}
        onEdit={onEdit}
        onDelete={onDelete}
        onImageClick={onImageClick}
      />
    </div>
  );
};

export const MessageItem = React.memo(MessageItemComponent);

export default MessageItem;
