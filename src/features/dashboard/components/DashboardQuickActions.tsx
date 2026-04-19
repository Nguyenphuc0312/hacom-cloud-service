import { NotificationOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

import { SurfaceCard } from '@/components/ui/SurfaceCard';

interface DashboardQuickAction {
  id: string;
  label: string;
  description: string;
  onSelect: () => void;
  icon: ReactNode;
}

interface DashboardQuickActionsProps {
  onCreateUser: () => void;
  onSendBroadcast: () => void;
  onCreateGroup: () => void;
}

export const DashboardQuickActions = ({
  onCreateUser,
  onSendBroadcast,
  onCreateGroup,
}: DashboardQuickActionsProps) => {
  const actions: DashboardQuickAction[] = [
    {
      id: 'create-user',
      label: 'Tạo người dùng',
      description: 'Mời và cấp tài khoản quản trị mới.',
      onSelect: onCreateUser,
      icon: <UserAddOutlined />,
    },
    {
      id: 'send-broadcast',
      label: 'Gửi broadcast',
      description: 'Chuẩn bị thông báo hoặc bản tin gửi ra ngoài.',
      onSelect: onSendBroadcast,
      icon: <NotificationOutlined />,
    },
    {
      id: 'create-group',
      label: 'Tạo nhóm',
      description: 'Thiết lập nhóm vận hành hoặc tập quyền mới.',
      onSelect: onCreateGroup,
      icon: <TeamOutlined />,
    },
  ];

  return (
    <SurfaceCard
      eyebrow="Tác vụ nhanh"
      title="Việc cần làm"
      description="Dùng dashboard như điểm điều phối thao tác, không phải màn giám sát thứ hai."
      className="ds-dashboard-quick-actions"
    >
      <div className="ds-dashboard-quick-actions-list">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="ds-dashboard-quick-action"
            onClick={action.onSelect}
          >
            <span className="ds-dashboard-quick-action-icon">{action.icon}</span>
            <span className="ds-dashboard-quick-action-copy">
              <strong>{action.label}</strong>
              <span>{action.description}</span>
            </span>
          </button>
        ))}
      </div>
    </SurfaceCard>
  );
};
