import { chatApi } from "../api/chatApi";

interface CreateGroupInviteLinkInput {
  conversationId: string;
  name?: string;
  expireAt?: string;
  usageLimit?: number;
}

export const createGroupInviteLinkUseCase = async (
  input: CreateGroupInviteLinkInput,
) => {
  return chatApi.group.createInviteLink(input.conversationId, {
    name: input.name,
    expireAt: input.expireAt,
    usageLimit: input.usageLimit,
  });
};
