import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted() makes mocks available inside vi.mock factory (which is hoisted)
const transferOwnershipMock = vi.hoisted(() => vi.fn());
const deleteGroupMock = vi.hoisted(() => vi.fn());
const banMemberMock = vi.hoisted(() => vi.fn());
const unbanMemberMock = vi.hoisted(() => vi.fn());

// Mock the chatApi re-export module that usecases import from
vi.mock('../api/chatApi', () => ({
  chatApi: {
    group: {
      transferOwnership: transferOwnershipMock,
      deleteGroup: deleteGroupMock,
      banMember: banMemberMock,
      unbanMember: unbanMemberMock,
    },
  },
}));

// Import after mocks
import { transferOwnershipUseCase } from './transferOwnership';
import { deleteGroupUseCase } from './deleteGroup';
import { banMemberUseCase, unbanMemberUseCase } from './manageMemberRestrictions';

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

});
