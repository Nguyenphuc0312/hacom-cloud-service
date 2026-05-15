import { transferOwnershipUseCase } from '../transferOwnership';
import { deleteGroupUseCase } from '../deleteGroup';
import { banMemberUseCase, unbanMemberUseCase } from '../manageMemberRestrictions';
import { getGroupInvitesUseCase, acceptGroupInviteUseCase, declineGroupInviteUseCase } from '../groupInvites';

// Mock the API module
jest.mock('../../api/chatApi', () => ({
  chatApi: {
    group: {
      transferOwnership: jest.fn(),
      deleteGroup: jest.fn(),
      banMember: jest.fn(),
      unbanMember: jest.fn(),
      getGroupInvites: jest.fn(),
      acceptGroupInvite: jest.fn(),
      declineGroupInvite: jest.fn(),
    },
  },
}));

import { chatApi } from '../../api/chatApi';

describe('Group Use Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transferOwnershipUseCase', () => {
    it('should call transferOwnership API with correct parameters', async () => {
      (chatApi.group.transferOwnership as jest.Mock).mockResolvedValue(undefined);

      await transferOwnershipUseCase('group-1', 'new-owner-id');

      expect(chatApi.group.transferOwnership).toHaveBeenCalledWith(
        'group-1',
        'new-owner-id',
      );
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Transfer failed');
      (chatApi.group.transferOwnership as jest.Mock).mockRejectedValue(error);

      await expect(
        transferOwnershipUseCase('group-1', 'new-owner-id'),
      ).rejects.toThrow('Transfer failed');
    });
  });

  describe('deleteGroupUseCase', () => {
    it('should call deleteGroup API with correct parameters', async () => {
      (chatApi.group.deleteGroup as jest.Mock).mockResolvedValue(undefined);

      await deleteGroupUseCase('group-1');

      expect(chatApi.group.deleteGroup).toHaveBeenCalledWith('group-1');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Delete failed');
      (chatApi.group.deleteGroup as jest.Mock).mockRejectedValue(error);

      await expect(deleteGroupUseCase('group-1')).rejects.toThrow(
        'Delete failed',
      );
    });
  });

  describe('banMemberUseCase', () => {
    it('should call banMember API with correct parameters', async () => {
      (chatApi.group.banMember as jest.Mock).mockResolvedValue(undefined);

      await banMemberUseCase('group-1', 'user-1');

      expect(chatApi.group.banMember).toHaveBeenCalledWith('group-1', 'user-1');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Ban failed');
      (chatApi.group.banMember as jest.Mock).mockRejectedValue(error);

      await expect(banMemberUseCase('group-1', 'user-1')).rejects.toThrow(
        'Ban failed',
      );
    });
  });

  describe('unbanMemberUseCase', () => {
    it('should call unbanMember API with correct parameters', async () => {
      (chatApi.group.unbanMember as jest.Mock).mockResolvedValue(undefined);

      await unbanMemberUseCase('group-1', 'user-1');

      expect(chatApi.group.unbanMember).toHaveBeenCalledWith(
        'group-1',
        'user-1',
      );
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Unban failed');
      (chatApi.group.unbanMember as jest.Mock).mockRejectedValue(error);

      await expect(unbanMemberUseCase('group-1', 'user-1')).rejects.toThrow(
        'Unban failed',
      );
    });
  });

  describe('getGroupInvitesUseCase', () => {
    it('should return parsed invites from API', async () => {
      const mockResponse = {
        data: [
          {
            id: 'invite-1',
            conversationId: 'group-1',
            inviterUserId: 'user-1',
            status: 'pending',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };
      (chatApi.group.getGroupInvites as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await getGroupInvitesUseCase();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'invite-1',
        conversationId: 'group-1',
        inviterUserId: 'user-1',
        inviterName: '',
        inviterAvatar: undefined,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        conversationName: undefined,
        conversationAvatar: undefined,
      });
    });

    it('should pass status filter to API', async () => {
      (chatApi.group.getGroupInvites as jest.Mock).mockResolvedValue({ data: [] });

      await getGroupInvitesUseCase('pending');

      expect(chatApi.group.getGroupInvites).toHaveBeenCalledWith('pending');
    });

    it('should return empty array when API returns no data', async () => {
      (chatApi.group.getGroupInvites as jest.Mock).mockResolvedValue({
        data: null,
      });

      const result = await getGroupInvitesUseCase();

      expect(result).toEqual([]);
    });
  });

  describe('acceptGroupInviteUseCase', () => {
    it('should call acceptGroupInvite API with correct parameters', async () => {
      (chatApi.group.acceptGroupInvite as jest.Mock).mockResolvedValue({});

      await acceptGroupInviteUseCase('invite-1');

      expect(chatApi.group.acceptGroupInvite).toHaveBeenCalledWith('invite-1');
    });
  });

  describe('declineGroupInviteUseCase', () => {
    it('should call declineGroupInvite API with correct parameters', async () => {
      (chatApi.group.declineGroupInvite as jest.Mock).mockResolvedValue(undefined);

      await declineGroupInviteUseCase('invite-1');

      expect(chatApi.group.declineGroupInvite).toHaveBeenCalledWith('invite-1');
    });
  });
});
