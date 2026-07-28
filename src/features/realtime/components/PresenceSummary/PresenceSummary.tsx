import { Tooltip } from 'antd';
import { useMemo } from 'react';

import type { OnlineUser } from '@/api/types/realtime/realtime';

import './PresenceSummary.css';

/**
 * Presence states the gateway can report, in the order operators read them:
 * actively connected first, degraded attention last.
 */
const STATE_META: ReadonlyArray<{ key: string; label: string; tone: string }> = [
  { key: 'online', label: 'Trực tuyến', tone: 'online' },
  { key: 'away', label: 'Vắng mặt', tone: 'away' },
  { key: 'idle', label: 'Chờ', tone: 'idle' },
  { key: 'busy', label: 'Bận', tone: 'busy' },
  { key: 'dnd', label: 'Không làm phiền', tone: 'dnd' },
];

interface PresenceSummaryProps {
  /** Backend total across all pages — the only figure that describes the whole system. */
  total: number;
  /** Rows on the current page; the state split can only be derived from these. */
  pageItems: OnlineUser[];
  /** True when presence could not be read at all. */
  isStale: boolean;
  /** Server-reported reason, shown verbatim so operators can act on it. */
  staleReason: string | null;
  lastUpdatedAt: number | undefined;
  isFetching: boolean;
}

const formatClock = (timestamp: number | undefined): string => {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * The header figure for "how many people are online" plus the state split.
 *
 * Deliberately not four identical stat cards: one figure is authoritative
 * (backend total), the rest describe the current page only, and conflating
 * them in matching tiles would imply a precision the data does not have.
 */
export const PresenceSummary: React.FC<PresenceSummaryProps> = ({
  total,
  pageItems,
  isStale,
  staleReason,
  lastUpdatedAt,
  isFetching,
}) => {
  const { segments, connections, pageTotal } = useMemo(() => {
    const counts = new Map<string, number>();
    let connectionTotal = 0;

    for (const user of pageItems) {
      counts.set(user.presenceState, (counts.get(user.presenceState) ?? 0) + 1);
      connectionTotal += user.connectionCount;
    }

    const known = STATE_META.map((meta) => ({ ...meta, count: counts.get(meta.key) ?? 0 })).filter(
      (segment) => segment.count > 0,
    );

    return { segments: known, connections: connectionTotal, pageTotal: pageItems.length };
  }, [pageItems]);

  if (isStale) {
    return (
      <section className="presence-summary presence-summary--stale" role="status">
        <div className="presence-summary-headline">
          <span className="presence-summary-figure presence-summary-figure--unknown">—</span>
          <div className="presence-summary-caption">
            <strong>Không đọc được presence</strong>
            <span>{staleReason ?? 'Nguồn presence không khả dụng.'}</span>
          </div>
        </div>
        <p className="presence-summary-warning">
          Danh sách trống ở đây <strong>không</strong> có nghĩa là không có ai online — hệ thống
          hiện không đọc được trạng thái kết nối.
        </p>
      </section>
    );
  }

  return (
    <section className="presence-summary" aria-label="Tổng quan người dùng online">
      <div className="presence-summary-headline">
        <span className="presence-summary-figure">{total}</span>
        <div className="presence-summary-caption">
          <strong>người đang kết nối</strong>
          <span>{connections} phiên WebSocket đang mở trong trang này</span>
        </div>
        <span
          className={`presence-summary-freshness${isFetching ? ' is-fetching' : ''}`}
          title="Thời điểm dữ liệu presence được đọc gần nhất"
        >
          <i aria-hidden />
          {isFetching ? 'Đang cập nhật…' : `Cập nhật ${formatClock(lastUpdatedAt)}`}
        </span>
      </div>

      {segments.length > 0 && (
        <>
          <div
            className="presence-summary-bar"
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(', ')}
          >
            {segments.map((segment) => (
              <Tooltip key={segment.key} title={`${segment.label}: ${segment.count}`}>
                <span
                  className={`presence-summary-segment presence-summary-segment--${segment.tone}`}
                  style={{ flexGrow: segment.count }}
                />
              </Tooltip>
            ))}
          </div>
          <ul className="presence-summary-legend">
            {segments.map((segment) => (
              <li key={segment.key}>
                <span className={`presence-summary-dot presence-summary-dot--${segment.tone}`} />
                {segment.label}
                <strong>{segment.count}</strong>
              </li>
            ))}
            <li className="presence-summary-legend-note">trên {pageTotal} dòng của trang này</li>
          </ul>
        </>
      )}
    </section>
  );
};
