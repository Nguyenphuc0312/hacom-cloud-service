import { describe, expect, it, vi } from 'vitest';
import type { CloudAsset } from './cloudApi';
import { deleteCloudAssetForMessage } from './cloudApi';

const asset = { id: 'asset-1', messageId: 'message-1', status: 'available' } as CloudAsset;

describe('deleteCloudAssetForMessage', () => {
  it('uses the loaded asset id when it is present', async () => {
    const gateway = { trash: vi.fn().mockResolvedValue(asset), trashByMessage: vi.fn() };
    await deleteCloudAssetForMessage('message-1', [asset], gateway);
    expect(gateway.trash).toHaveBeenCalledWith('asset-1');
    expect(gateway.trashByMessage).not.toHaveBeenCalled();
  });

  it('uses the canonical message resolver for an asset outside the first 100 items', async () => {
    const gateway = { trash: vi.fn(), trashByMessage: vi.fn().mockResolvedValue(asset) };
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...asset,
      id: `asset-${index}`,
      messageId: `message-${index}`,
    }));
    await deleteCloudAssetForMessage('message-101', firstPage, gateway);
    expect(gateway.trashByMessage).toHaveBeenCalledWith('message-101');
    expect(gateway.trash).not.toHaveBeenCalled();
  });

  it('does not depend on the current search or filter result', async () => {
    const gateway = { trash: vi.fn(), trashByMessage: vi.fn().mockResolvedValue(asset) };
    await deleteCloudAssetForMessage('message-filtered-out', [], gateway);
    expect(gateway.trashByMessage).toHaveBeenCalledWith('message-filtered-out');
    expect(gateway.trash).not.toHaveBeenCalled();
  });
});
