import React from 'react';
import { BellOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';

export const TopbarActions: React.FC = () => {
  return (
    <div className="ds-topbar-actions">
      <button type="button" className="ds-btn ds-btn--icon" aria-label="Notifications">
        <BellOutlined />
      </button>
      <button type="button" className="ds-btn ds-btn--icon" aria-label="Create quick action">
        <PlusOutlined />
      </button>
      <button className="ds-topbar-profile" aria-label="Current user profile" type="button">
        <span className="ds-topbar-profile-avatar" aria-hidden>
          <UserOutlined />
        </span>
        <span className="ds-topbar-profile-copy">
          <strong>Admin</strong>
          <small>Super User</small>
        </span>
      </button>
    </div>
  );
};
