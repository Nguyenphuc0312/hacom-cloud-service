import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

import { AppIcon } from '@/components/AppIcon/AppIcon';

export interface BreadcrumbItem {
  label: string;
  route?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
}

export const Breadcrumbs = ({ items, showHome = true }: BreadcrumbsProps) => {
  const breadcrumbItems = [
    ...(showHome
      ? [
          {
            key: 'home',
            title: (
              <Link to="/" className="ds-breadcrumb-home">
                <AppIcon name="dashboard" size={14} aria-hidden />
                <span>Trang chủ</span>
              </Link>
            ),
          },
        ]
      : []),
    ...items.map((item, index) => ({
      key: `breadcrumb-${index}`,
      title: item.route ? (
        <Link to={item.route} className="ds-breadcrumb-link">
          {item.label}
        </Link>
      ) : (
        <span className="ds-breadcrumb-current">{item.label}</span>
      ),
    })),
  ];

  if (breadcrumbItems.length <= 1) {
    return null;
  }

  return (
    <Breadcrumb
      className="ds-breadcrumbs"
      items={breadcrumbItems}
      separator={<AppIcon name="chevronsUpDown" size={12} aria-hidden />}
    />
  );
};

interface LastUpdatedProps {
  timestamp?: string | Date | null;
  label?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const LastUpdated = ({
  timestamp,
  label = 'Cập nhật',
  refreshing = false,
  onRefresh,
}: LastUpdatedProps) => {
  if (!timestamp) {
    return null;
  }

  return (
    <div className="ds-last-updated">
      <span className={`ds-last-updated-label ${onRefresh ? 'ds-last-updated-clickable' : ''}`}>
        {label}:
        <time className="ds-last-updated-time" dateTime={new Date(timestamp).toISOString()}>
          {formatDateTime(new Date(timestamp).toISOString())}
        </time>
        {refreshing && (
          <AppIcon name="refresh" size={12} className="ds-last-updated-spinner" aria-label="Đang làm mới" />
        )}
      </span>
    </div>
  );
};

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
