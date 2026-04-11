import { chatApi } from "../api/chatApi";

interface AddReactionInput {
  messageId: string;
  emoji: string;
}

export const addReactionUseCase = async (input: AddReactionInput) => {
  return chatApi.message.addReaction(input.messageId, input.emoji);
};
