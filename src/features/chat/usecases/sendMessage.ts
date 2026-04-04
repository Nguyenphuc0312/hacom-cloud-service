import { useChatStore } from "../../../stores";
import type { Attachment } from "../../../types";
import { MessageType } from "../../../types";

interface SendMessageInput {
  conversationId: string;
  content: string;
  attachments?: Attachment[];
  type?: MessageType;
  replyToId?: string;
}

export const sendMessageUseCase = async (input: SendMessageInput) => {
  const { sendMessage } = useChatStore.getState();
  return sendMessage(
    input.conversationId,
    input.content,
    input.type,
    input.attachments,
    input.replyToId,
  );
};
