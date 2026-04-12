import React from 'react';
import { Dropdown, Menu } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

interface RowActionsDropdownProps {
  actions: Array<{
    key: string;
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
  }>;
}

export const RowActionsDropdown: React.FC<RowActionsDropdownProps> = ({ actions }) => (
  <Dropdown
    overlay={
      <Menu>
        {actions.map((action) => (
          <Menu.Item
            key={action.key}
            icon={action.icon}
            danger={action.danger}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu>
    }
    trigger={['click']}
    placement="bottomRight"
  >
    <button className="ds-table-row-action-btn" aria-label="Hành động">
      <MoreOutlined />
    </button>
  </Dropdown>
);
