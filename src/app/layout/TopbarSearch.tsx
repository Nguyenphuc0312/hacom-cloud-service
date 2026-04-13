import React from 'react';
import { SearchOutlined } from '@ant-design/icons';

interface TopbarSearchProps {
  onOpen: () => void;
}

export const TopbarSearch: React.FC<TopbarSearchProps> = ({ onOpen }) => {
  return (
    <button
      type="button"
      className="ds-topbar-search"
      role="search"
      aria-label="Open command palette"
      onClick={onOpen}
    >
      <SearchOutlined className="ds-topbar-search-icon" aria-hidden />
      <span className="ds-topbar-search-copy">
        <span className="ds-topbar-search-label">Search pages, tools, and settings</span>
        <span className="ds-topbar-search-hint">Jump across the admin workspace</span>
      </span>
      <kbd className="ds-topbar-search-shortcut">Ctrl K</kbd>
    </button>
  );
};
