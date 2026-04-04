import { chatApi } from "../api/chatApi";

interface RemoveReactionInput {
  messageId: string;
  emoji: string;
}

export const removeReactionUseCase = async (input: RemoveReactionInput) => {
  return chatApi.message.removeReaction(input.messageId, input.emoji);
};
