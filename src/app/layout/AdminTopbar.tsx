import React from 'react';
import { TopbarSearch } from './TopbarSearch';
import { TopbarActions } from './TopbarActions';

export const AdminTopbar: React.FC = () => {
  return (
    <header className="ds-admin-topbar">
      <div className="ds-admin-topbar-left">{/* Breadcrumb or Page Title here */}</div>
      <div className="ds-admin-topbar-center">
        <TopbarSearch />
      </div>
      <div className="ds-admin-topbar-right">
        <TopbarActions />
        {/* Profile menu here */}
      </div>
    </header>
  );
};
