import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted() makes mocks available inside vi.mock factory (which is hoisted)
const transferOwnershipMock = vi.hoisted(() => vi.fn());
const deleteGroupMock = vi.hoisted(() => vi.fn());
const banMemberMock = vi.hoisted(() => vi.fn());
const unbanMemberMock = vi.hoisted(() => vi.fn());
const getGroupInvitesMock = vi.hoisted(() => vi.fn());
const acceptGroupInviteMock = vi.hoisted(() => vi.fn());
const declineGroupInviteMock = vi.hoisted(() => vi.fn());

// Mock the chatApi re-export module that usecases import from
vi.mock('../api/chatApi', () => ({
  chatApi: {
    group: {
      transferOwnership: transferOwnershipMock,
      deleteGroup: deleteGroupMock,
      banMember: banMemberMock,
      unbanMember: unbanMemberMock,
      getGroupInvites: getGroupInvitesMock,
      acceptGroupInvite: acceptGroupInviteMock,
      declineGroupInvite: declineGroupInviteMock,
    },
  },
}));

// Import after mocks
import { transferOwnershipUseCase } from './transferOwnership';
import { deleteGroupUseCase } from './deleteGroup';
import { banMemberUseCase, unbanMemberUseCase } from './manageMemberRestrictions';
import {
  getGroupInvitesUseCase,
  acceptGroupInviteUseCase,
  declineGroupInviteUseCase,
} from './groupInvites';

describe('Group Use Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transferOwnershipUseCase', () => {
    it('should call transferOwnership API with correct parameters', async () => {
      transferOwnershipMock.mockResolvedValue(undefined);

      await transferOwnershipUseCase('group-1', 'new-owner-id');

      expect(transferOwnershipMock).toHaveBeenCalledWith('group-1', 'new-owner-id');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Transfer failed');
      transferOwnershipMock.mockRejectedValue(error);

      await expect(
        transferOwnershipUseCase('group-1', 'new-owner-id'),
      ).rejects.toThrow('Transfer failed');
    });
  });

  describe('deleteGroupUseCase', () => {
    it('should call deleteGroup API with correct parameters', async () => {
      deleteGroupMock.mockResolvedValue(undefined);

      await deleteGroupUseCase('group-1');

      expect(deleteGroupMock).toHaveBeenCalledWith('group-1');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Delete failed');
      deleteGroupMock.mockRejectedValue(error);

      await expect(deleteGroupUseCase('group-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('banMemberUseCase', () => {
    it('should call banMember API with correct parameters', async () => {
      banMemberMock.mockResolvedValue(undefined);

      await banMemberUseCase('group-1', 'user-1');

      expect(banMemberMock).toHaveBeenCalledWith('group-1', 'user-1');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Ban failed');
      banMemberMock.mockRejectedValue(error);

      await expect(banMemberUseCase('group-1', 'user-1')).rejects.toThrow('Ban failed');
    });
  });

  describe('unbanMemberUseCase', () => {
    it('should call unbanMember API with correct parameters', async () => {
      unbanMemberMock.mockResolvedValue(undefined);

      await unbanMemberUseCase('group-1', 'user-1');

      expect(unbanMemberMock).toHaveBeenCalledWith('group-1', 'user-1');
    });

    it('should propagate errors from API', async () => {
      const error = new Error('Unban failed');
      unbanMemberMock.mockRejectedValue(error);

      await expect(unbanMemberUseCase('group-1', 'user-1')).rejects.toThrow('Unban failed');
    });
  });

  describe('getGroupInvitesUseCase', () => {
    it('should return parsed invites from API', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
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
      getGroupInvitesMock.mockResolvedValue(mockResponse);

      const result = await getGroupInvitesUseCase();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'invite-1',
        conversationId: 'group-1',
        inviterUserId: 'user-1',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should pass status filter to API', async () => {
      getGroupInvitesMock.mockResolvedValue({ success: true, statusCode: 200, data: [] });

      await getGroupInvitesUseCase('pending');

      expect(getGroupInvitesMock).toHaveBeenCalledWith('pending');
    });

    it('should return empty array when API returns no data', async () => {
      getGroupInvitesMock.mockResolvedValue({ success: true, statusCode: 200, data: null });

      const result = await getGroupInvitesUseCase();

      expect(result).toEqual([]);
    });
  });

  describe('acceptGroupInviteUseCase', () => {
    it('should call acceptGroupInvite API with correct parameters', async () => {
      acceptGroupInviteMock.mockResolvedValue({});

      await acceptGroupInviteUseCase('invite-1');

      expect(acceptGroupInviteMock).toHaveBeenCalledWith('invite-1');
    });
  });

  describe('declineGroupInviteUseCase', () => {
    it('should call declineGroupInvite API with correct parameters', async () => {
      declineGroupInviteMock.mockResolvedValue(undefined);

      await declineGroupInviteUseCase('invite-1');

      expect(declineGroupInviteMock).toHaveBeenCalledWith('invite-1');
    });
  });
});
