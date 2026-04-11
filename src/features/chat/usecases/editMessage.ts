import { chatApi } from "../api/chatApi";

interface EditMessageInput {
  messageId: string;
  content: string;
}

export const editMessageUseCase = async (input: EditMessageInput) => {
  return chatApi.message.editMessage(input.messageId, input.content);
};
