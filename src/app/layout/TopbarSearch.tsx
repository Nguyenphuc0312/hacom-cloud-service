import React from 'react';
import { SearchOutlined } from '@ant-design/icons';

export const TopbarSearch: React.FC = () => {
  return (
    <div className="ds-topbar-search" role="search" aria-label="Site search">
      <SearchOutlined className="ds-topbar-search-icon" aria-hidden />
      <input
        id="topbar-search"
        className="ds-input"
        placeholder="Tìm kiếm..."
        aria-label="Tìm kiếm"
        type="search"
      />
      <kbd className="ds-topbar-search-shortcut">Ctrl K</kbd>
    </div>
  );
};
