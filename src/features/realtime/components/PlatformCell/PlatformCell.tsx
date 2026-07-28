import { Tooltip } from 'antd';

import { AppIcon, type AppIconKey } from '@/components/AppIcon/AppIcon';

import './PlatformCell.css';

/** Device classes the websocket gateway reports, in display order. */
const PLATFORM_META: ReadonlyArray<{ key: string; label: string; icon: AppIconKey }> = [
  { key: 'web', label: 'Trình duyệt', icon: 'globe' },
  { key: 'desktop', label: 'Ứng dụng máy tính', icon: 'monitor' },
  { key: 'mobile', label: 'Điện thoại', icon: 'smartphone' },
];

interface PlatformCellProps {
  platforms: Record<string, number>;
  /** Total live sessions; anything beyond the classified ones is unknown. */
  connectionCount: number;
}

/**
 * Which kind of device holds a user's live connections.
 *
 * The gateway classifies sessions from the handshake User-Agent, so some can be
 * unclassified (older connections, unrecognized agents). Those are shown
 * explicitly as unknown instead of being folded into a device that would read
 * as fact.
 */
export const PlatformCell: React.FC<PlatformCellProps> = ({ platforms, connectionCount }) => {
  const known = PLATFORM_META.map((meta) => ({ ...meta, count: platforms[meta.key] ?? 0 })).filter(
    (entry) => entry.count > 0,
  );

  const classified = known.reduce((total, entry) => total + entry.count, 0);
  const unknown = Math.max(0, connectionCount - classified);

  if (known.length === 0 && unknown === 0) {
    return <span className="platform-cell-empty">—</span>;
  }

  return (
    <span className="platform-cell">
      {known.map((entry) => (
        <Tooltip
          key={entry.key}
          title={`${entry.label}: ${entry.count} kết nối`}
        >
          <span className="platform-cell-item">
            <AppIcon name={entry.icon} size={14} aria-hidden />
            {entry.count > 1 && <b>{entry.count}</b>}
            <span className="ds-sr-only">
              {entry.label}: {entry.count} kết nối
            </span>
          </span>
        </Tooltip>
      ))}

      {unknown > 0 && (
        <Tooltip title="Kết nối mở trước khi hệ thống ghi nhận loại thiết bị, hoặc trình duyệt không nhận diện được.">
          <span className="platform-cell-item platform-cell-item--unknown">
            <AppIcon name="alertCircle" size={14} aria-hidden />
            {unknown > 1 && <b>{unknown}</b>}
            <span className="ds-sr-only">Không rõ thiết bị: {unknown} kết nối</span>
          </span>
        </Tooltip>
      )}
    </span>
  );
};
