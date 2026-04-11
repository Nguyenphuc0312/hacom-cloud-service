import { chatApi } from "../api/chatApi";

export const deleteMessageUseCase = async (messageId: string) => {
  return chatApi.message.deleteMessage(messageId);
};
