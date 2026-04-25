import { chatApi } from "../api/chatApi";
import { RoomMemberRole } from "../../../types";

export const updateConversationMemberRoleUseCase = async (
  conversationId: string,
  userId: string,
  role: RoomMemberRole.ADMIN | RoomMemberRole.MEMBER | "owner",
) => {
  return chatApi.conversation.updateMemberRole(conversationId, userId, role);
};
