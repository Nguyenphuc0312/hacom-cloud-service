import React from 'react';
import { BellOutlined, PlusOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

import type { CurrentAdmin } from '@/api/types';
import { UserMenu } from '@/components/UserMenu';

export interface QuickActionItem {
  key: string;
  label: string;
  onSelect: () => void;
}

interface TopbarActionsProps {
  user: CurrentAdmin | null;
  environmentLabel?: string;
  systemTone: 'healthy' | 'degraded';
  liveUpdatesLabel: string;
  liveUpdatesMode: 'live' | 'polling';
  quickActions: QuickActionItem[];
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const TopbarActions: React.FC<TopbarActionsProps> = ({
  user,
  environmentLabel = 'Production',
  systemTone,
  liveUpdatesLabel,
  liveUpdatesMode,
  quickActions,
  onOpenNotifications,
  onOpenProfile,
  onOpenSettings,
  onLogout,
}) => {
  const quickActionItems: MenuProps['items'] = quickActions.map((action) => ({
    key: action.key,
    label: action.label,
    onClick: action.onSelect,
  }));

  return (
    <div className="ds-topbar-actions">
      <div className="ds-topbar-status" aria-label="Workspace status">
        <span className="ds-shell-chip">{environmentLabel}</span>
        <span
          className={`ds-shell-chip ${systemTone === 'healthy' ? 'ds-shell-chip--success' : 'ds-shell-chip--warning'}`}
        >
          {systemTone === 'healthy' ? 'Healthy' : 'Degraded'}
        </span>
        <span
          className={`ds-shell-chip ${liveUpdatesMode === 'live' ? 'ds-shell-chip--success' : 'ds-shell-chip--ghost'}`}
        >
          {liveUpdatesLabel}
        </span>
      </div>
      <button
        type="button"
        className="ds-btn ds-btn--icon"
        aria-label="Notifications"
        onClick={onOpenNotifications}
      >
        <BellOutlined />
      </button>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        overlayClassName="user-menu-dropdown"
        menu={{ items: quickActionItems }}
      >
        <button
          type="button"
          className="ds-btn ds-btn--icon"
          aria-label="Open quick actions"
        >
          <PlusOutlined />
        </button>
      </Dropdown>
      <UserMenu
        user={user}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </div>
  );
};
