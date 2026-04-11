import { useChatStore } from "../../../stores";
import type { Message } from "../../../types";

interface RetrySendMessageInput {
  conversationId: string;
  message: Message;
}

export const retrySendMessageUseCase = async (input: RetrySendMessageInput) => {
  const { resendMessage } = useChatStore.getState();
  return resendMessage(input.conversationId, input.message);
};
