import { chatApi } from "../api/chatApi";

interface CreateGroupInviteLinkInput {
  conversationId: string;
  name?: string;
}

export const createGroupInviteLinkUseCase = async (
  input: CreateGroupInviteLinkInput,
) => {
  return chatApi.group.createInviteLink(input.conversationId, {
    name: input.name,
  });
};
