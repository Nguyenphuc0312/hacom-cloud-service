import { chatApi } from "../api/chatApi";

export interface GroupInviteItem {
  id: string;
  conversationId: string;
  inviterUserId: string;
  inviterName?: string;
  inviterAvatar?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  conversationName?: string;
  conversationAvatar?: string;
}

export const getGroupInvitesUseCase = async (
  status?: 'pending' | 'accepted' | 'declined'
): Promise<GroupInviteItem[]> => {
  const response = await chatApi.group.getGroupInvites(status);
  const data = (response as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((item: unknown) => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id ?? ''),
      conversationId: String(record.conversationId ?? ''),
      inviterUserId: String(record.inviterUserId ?? record.inviter_user_id ?? ''),
      inviterName: String(record.inviterName ?? record.inviter_name ?? ''),
      inviterAvatar: record.inviterAvatar ? String(record.inviterAvatar) : undefined,
      status: (record.status as string) as GroupInviteItem['status'],
      createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
      conversationName: record.conversationName ? String(record.conversationName) : undefined,
      conversationAvatar: record.conversationAvatar ? String(record.conversationAvatar) : undefined,
    };
  });
};

export const acceptGroupInviteUseCase = async (inviteId: string) => {
  return chatApi.group.acceptGroupInvite(inviteId);
};

export const declineGroupInviteUseCase = async (inviteId: string) => {
  return chatApi.group.declineGroupInvite(inviteId);
};
