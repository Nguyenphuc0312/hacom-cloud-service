import { Skeleton, Tooltip, Typography } from 'antd';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import type { UserDevice, UserSession } from '@/api/types/sessions/sessions';
import { useUserDevices, useUserSessions } from '../../hooks/useUserDevices/useUserDevices';

import './UserDeviceStrip.css';

const { Text } = Typography;

interface UserDeviceStripProps {
  userId: string;
  /** Live websocket sessions from presence — a count, never a device identity. */
  connectionCount: number;
}

type IconName = 'smartphone' | 'monitor' | 'globe';

/**
 * Maps a platform string to an icon. Deliberately conservative: anything we
 * cannot classify shows the neutral globe rather than guessing a device type.
 */
const platformIcon = (platform: string | null, userAgent: string | null): IconName => {
  const haystack = `${platform ?? ''} ${userAgent ?? ''}`.toLowerCase();
  if (/android|ios|iphone|ipad|mobile/.test(haystack)) return 'smartphone';
  if (/windows|mac|linux|desktop|electron/.test(haystack)) return 'monitor';
  return 'globe';
};

const deviceLabel = (device: UserDevice): string =>
  device.deviceName || device.platform || 'Thiết bị không tên';

const sessionLabel = (session: UserSession): string =>
  session.deviceName || session.devicePlatform || 'Phiên không rõ thiết bị';

/**
 * Devices and login sessions for one user, shown inline under their row.
 *
 * The heading states plainly what presence can and cannot tell us: we know how
 * many live connections exist, but not which device holds them. Registered
 * devices come from the auth service and describe the account, not the moment.
 */
export const UserDeviceStrip: React.FC<UserDeviceStripProps> = ({ userId, connectionCount }) => {
  const devicesQuery = useUserDevices(userId, true);
  const sessionsQuery = useUserSessions(userId, true);

  const devices = devicesQuery.data?.items ?? [];
  const sessions = (sessionsQuery.data?.items ?? []).filter((session) => !session.isRevoked);
  const isLoading = devicesQuery.isLoading || sessionsQuery.isLoading;
  const hasError = devicesQuery.isError && sessionsQuery.isError;

  return (
    <div className="device-strip">
      <p className="device-strip-lede">
        <strong>{connectionCount}</strong> kết nối WebSocket đang mở.
        <Tooltip title="Presence chỉ ghi nhận số kết nối, không ghi nhận thiết bị của từng kết nối. Danh sách dưới đây là thiết bị và phiên đăng nhập của tài khoản (nguồn: chat-auth-service).">
          <span className="device-strip-note">
            Không xác định được kết nối nào thuộc thiết bị nào
            <AppIcon name="info" size={12} aria-hidden />
          </span>
        </Tooltip>
      </p>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      ) : hasError ? (
        <Text type="secondary">Không tải được thiết bị và phiên đăng nhập của tài khoản.</Text>
      ) : devices.length === 0 && sessions.length === 0 ? (
        <Text type="secondary">
          Tài khoản chưa đăng ký thiết bị nào. Thiết bị được ghi nhận khi người dùng đăng nhập
          trên ứng dụng di động hoặc desktop.
        </Text>
      ) : (
        <div className="device-strip-groups">
          {devices.length > 0 && (
            <section>
              <h4>Thiết bị đã đăng ký</h4>
              <ul className="device-strip-list">
                {devices.map((device) => (
                  <li key={device.id}>
                    <AppIcon
                      name={platformIcon(device.platform, device.userAgent)}
                      size={14}
                      aria-hidden
                    />
                    <span className="device-strip-name">{deviceLabel(device)}</span>
                    {device.lastActiveAt && (
                      <span className="device-strip-meta">
                        <DateTimeCell value={device.lastActiveAt} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sessions.length > 0 && (
            <section>
              <h4>Phiên đăng nhập còn hiệu lực</h4>
              <ul className="device-strip-list">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <AppIcon
                      name={platformIcon(session.devicePlatform, session.userAgent)}
                      size={14}
                      aria-hidden
                    />
                    <span className="device-strip-name">{sessionLabel(session)}</span>
                    {session.ipAddress && (
                      <span className="device-strip-meta">{session.ipAddress}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
