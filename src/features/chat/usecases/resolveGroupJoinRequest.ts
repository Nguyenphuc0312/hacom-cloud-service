import { chatApi } from "../api/chatApi";

export const resolveGroupJoinRequestUseCase = async (
  conversationId: string,
  requestId: string,
  status: "approved" | "rejected",
) => {
  return chatApi.group.resolveJoinRequest(conversationId, requestId, status);
};
