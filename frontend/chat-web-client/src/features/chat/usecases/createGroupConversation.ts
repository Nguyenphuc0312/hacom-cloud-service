import { chatApi } from "../api/chatApi";

interface CreateGroupConversationInput {
  name: string;
  memberIds: string[];
  avatar?: string;
  avatarFileId?: string;
  description?: string;
}

export const createGroupConversationUseCase = async (
  input: CreateGroupConversationInput,
) => {
  return chatApi.conversation.createGroupConversation(input);
};
