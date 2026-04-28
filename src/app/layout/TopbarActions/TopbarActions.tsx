import React from 'react';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { IconActionButton } from '@/components/IconActionButton/IconActionButton';
import { UserMenu } from '@/components/UserMenu/UserMenu';
import type { CurrentAdmin } from '@/api/types/auth/auth';

interface TopbarActionsProps {
  user: CurrentAdmin | null;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const TopbarActions: React.FC<TopbarActionsProps> = ({
  user,
  onOpenNotifications,
  onOpenProfile,
  onOpenSettings,
  onLogout,
}) => {
  return (
    <div className="ds-topbar-actions">
      <IconActionButton
        icon={<AppIcon name="bell" size={16} aria-hidden />}
        tooltip="Thông báo"
        onClick={onOpenNotifications}
      />
      <UserMenu
        user={user}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </div>
  );
};
