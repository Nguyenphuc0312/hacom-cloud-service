import { chatApi } from "../api/chatApi";

export const getMessageByIdUseCase = async (messageId: string) => {
  return chatApi.message.getMessageById(messageId);
};
