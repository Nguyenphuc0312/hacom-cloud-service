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
  environmentLabel: string;
  liveUpdatesLabel: string;
}

export const DashboardQuickActions = ({
  onCreateUser,
  onSendBroadcast,
  onCreateGroup,
  environmentLabel,
  liveUpdatesLabel,
}: DashboardQuickActionsProps) => {
  const actions: DashboardQuickAction[] = [
    {
      id: 'create-user',
      label: 'Create user',
      description: 'Invite and provision a new admin account.',
      onSelect: onCreateUser,
      icon: <UserAddOutlined />,
    },
    {
      id: 'send-broadcast',
      label: 'Send broadcast',
      description: 'Prepare an outbound notification or announcement.',
      onSelect: onSendBroadcast,
      icon: <NotificationOutlined />,
    },
    {
      id: 'create-group',
      label: 'Create group',
      description: 'Set up a new operator cohort or permission slice.',
      onSelect: onCreateGroup,
      icon: <TeamOutlined />,
    },
  ];

  return (
    <SurfaceCard
      eyebrow="Quick actions"
      title="Operator shortcuts"
      description="Common tasks should stay one click away from the dashboard."
      className="ds-dashboard-quick-actions"
      status={
        <div className="ds-dashboard-context-badges">
          <span className="ds-shell-chip">{environmentLabel}</span>
          <span className="ds-shell-chip ds-shell-chip--ghost">{liveUpdatesLabel}</span>
        </div>
      }
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
