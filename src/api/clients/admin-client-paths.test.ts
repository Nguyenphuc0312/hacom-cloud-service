import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/api/axios/axios', () => ({
  adminAxiosInstance: { get, post },
}));

import { alertsClient } from './alertsClient/alertsClient';
import { incidentsClient } from './incidentsClient/incidentsClient';
import { realtimeClient } from './realtimeClient/realtimeClient';
import { assertAdminApiPath } from '../routes/routes';

describe('admin API client paths', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue({ data: { success: true, data: {} } });
    post.mockResolvedValue({ data: { success: true, data: {} } });
  });

  it('does not duplicate the admin prefix for realtime and alerts endpoints', async () => {
    await realtimeClient.getOverview();
    await alertsClient.getAlerts();
    await alertsClient.acknowledgeAlert('alert-1');

    expect(get).toHaveBeenNthCalledWith(1, '/realtime/overview');
    expect(get).toHaveBeenNthCalledWith(2, '/alerts', { params: {} });
    expect(post).toHaveBeenCalledWith('/alerts/alert-1/acknowledge');
  });

  it('does not duplicate the admin prefix for incident endpoints', async () => {
    await incidentsClient.getSystemStatus();
    await incidentsClient.exportIncident({ reason: 'investigate' });

    expect(get).toHaveBeenCalledWith('/incidents/status');
    expect(post).toHaveBeenCalledWith('/incidents/export', { reason: 'investigate' }, { headers: undefined });
  });

  it('rejects every duplicate form before Axios receives it', () => {
    expect(() => assertAdminApiPath('/admin/realtime/overview')).toThrow(/admin path segment/);
    expect(() => assertAdminApiPath('/api/v1/admin/realtime/overview')).toThrow(/admin API prefix/);
    expect(() => assertAdminApiPath('/api/v1/admin/admin/realtime/overview')).toThrow(/admin API prefix/);
  });
});
