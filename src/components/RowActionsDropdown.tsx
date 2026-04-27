import React from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';

import { AppIcon } from '@/components/AppIcon';
import { AppTooltip } from '@/components/AppTooltip';

interface RowActionsDropdownProps {
  actions: Array<{
    key: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
  }>;
}

export const RowActionsDropdown: React.FC<RowActionsDropdownProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const items: MenuProps['items'] = actions.map((action) => ({
    key: action.key,
    label: action.label,
    icon: action.icon,
    danger: action.danger,
    disabled: action.disabled,
  }));

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    setOpen(false);
    const act = actions.find((action) => action.key === key);
    if (act?.onClick) {
      window.setTimeout(() => {
        act.onClick?.();
      }, 0);
    }
  };

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      menu={{ items, onClick: onMenuClick }}
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="ds-row-actions-dropdown"
      getPopupContainer={() => document.body}
    >
      <AppTooltip title="Tác vụ">
        <button type="button" className="ds-table-row-action-btn" aria-label="Tác vụ dòng">
          <AppIcon name="more" size={16} aria-hidden />
        </button>
      </AppTooltip>
    </Dropdown>
  );
};
