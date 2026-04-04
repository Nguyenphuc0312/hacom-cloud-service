import { chatApi } from "../api/chatApi";

export const revokeGroupInviteLinkUseCase = async (
  conversationId: string,
  linkId: string,
) => {
  return chatApi.group.revokeInviteLink(conversationId, linkId);
};
