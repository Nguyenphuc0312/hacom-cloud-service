import { chatApi } from "../api/chatApi";
import { RoomMemberRole } from "../../../types";

export const updateConversationMemberRoleUseCase = async (
  conversationId: string,
  userId: string,
  role: RoomMemberRole | "owner",
) => {
  return chatApi.conversation.updateMemberRole(conversationId, userId, role);
};
