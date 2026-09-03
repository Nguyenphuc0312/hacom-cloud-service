import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminAxiosInstanceMock } = vi.hoisted(() => ({
  adminAxiosInstanceMock: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/api/axios/axios', () => ({
  adminAxiosInstance: adminAxiosInstanceMock,
}));

import {
  CloudApiError,
  cloudClient,
  createCloudMutationIdempotencyKey,
} from './cloudClient';

describe('cloudClient', () => {
  beforeEach(() => {
    adminAxiosInstanceMock.get.mockReset();
    adminAxiosInstanceMock.post.mockReset();
  });

  it('lists quota requests through the Admin public facade', async () => {
    adminAxiosInstanceMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { items: [{ id: 'quota-1', status: 'pending' }], nextCursor: 'next-1' },
      },
    });

    await expect(
      cloudClient.listQuotaRequests({ status: 'pending', limit: 25, cursor: '' }),
    ).resolves.toEqual({
      items: [{ id: 'quota-1', status: 'pending' }],
      nextCursor: 'next-1',
    });

    expect(adminAxiosInstanceMock.get).toHaveBeenCalledWith('/cloud/quota-requests', {
      params: { status: 'pending', limit: 25 },
    });
  });

  it('sends a trimmed note and stable idempotency key when approving', async () => {
    adminAxiosInstanceMock.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 'quota-1', status: 'approved', applied: true } },
    });
    const key = 'cloud-admin-intent-1';

    await expect(
      cloudClient.reviewQuotaRequest({
        requestId: 'quota/1',
        decision: 'approve',
        note: '  reviewed  ',
        idempotencyKey: key,
      }),
    ).resolves.toMatchObject({ id: 'quota-1', status: 'approved' });

    expect(adminAxiosInstanceMock.post).toHaveBeenCalledWith(
      '/cloud/quota-requests/quota%2F1/approve',
      { note: 'reviewed' },
      { headers: { 'Idempotency-Key': key } },
    );
  });

  it('sends an empty JSON object when rejecting without a note', async () => {
    adminAxiosInstanceMock.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 'quota-2', status: 'rejected' } },
    });

    await cloudClient.reviewQuotaRequest({
      requestId: 'quota-2',
      decision: 'reject',
      idempotencyKey: 'cloud-admin-intent-2',
    });

    expect(adminAxiosInstanceMock.post).toHaveBeenCalledWith(
      '/cloud/quota-requests/quota-2/reject',
      {},
      { headers: { 'Idempotency-Key': 'cloud-admin-intent-2' } },
    );
  });

  it('creates a non-empty key for a new mutation intent', () => {
    expect(createCloudMutationIdempotencyKey()).toMatch(/^cloud-admin-/);
  });

  it.each([
    [401, 'FORBIDDEN'],
    [403, 'FORBIDDEN'],
    [409, 'IDEMPOTENCY_CONFLICT'],
    [429, 'RATE_LIMITED'],
    [502, 'CLOUD_UNAVAILABLE'],
  ])('normalizes %i API errors with the backend code', async (status, code) => {
    adminAxiosInstanceMock.get.mockRejectedValueOnce({
      response: {
        status,
        headers: { 'x-request-id': 'req-cloud-1', 'retry-after': '10' },
        data: { success: false, error: { code, message: 'backend failure' } },
      },
    });

    const result = cloudClient.listQuotaRequests();
    await expect(result).rejects.toBeInstanceOf(CloudApiError);
    await expect(result).rejects.toMatchObject({
      status,
      code,
      requestId: 'req-cloud-1',
      retryAfter: '10',
      message: 'backend failure',
    });
  });

  it('normalizes a success:false envelope and preserves its request ID', async () => {
    adminAxiosInstanceMock.get.mockResolvedValueOnce({
      status: 400,
      data: {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'invalid query' },
        meta: { requestId: 'req-validation-1' },
      },
    });

    await expect(cloudClient.listQuotaRequests()).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'req-validation-1',
    });
  });

  it('maps not-found and upstream network failures without swallowing context', async () => {
    adminAxiosInstanceMock.get.mockRejectedValueOnce({
      response: {
        status: 404,
        headers: { 'x-request-id': 'req-not-found' },
        data: { success: false, error: { message: 'request not found' } },
      },
    });
    await expect(cloudClient.listQuotaRequests()).rejects.toMatchObject({
      status: 404,
      code: 'QUOTA_REQUEST_NOT_FOUND',
      requestId: 'req-not-found',
    });

    adminAxiosInstanceMock.get.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(cloudClient.listQuotaRequests()).rejects.toMatchObject({
      code: 'CLOUD_REQUEST_FAILED',
      message: 'ECONNRESET',
    });
  });

  it('rejects malformed idempotency keys before sending a mutation', async () => {
    await expect(
      cloudClient.reviewQuotaRequest({
        requestId: 'quota-1',
        decision: 'approve',
        idempotencyKey: ' ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(adminAxiosInstanceMock.post).not.toHaveBeenCalled();
  });
});
