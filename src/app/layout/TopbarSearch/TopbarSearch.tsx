import React from 'react';

import { AppIcon } from '@/components/AppIcon/AppIcon';

interface TopbarSearchProps {
  onOpen: () => void;
}

export const TopbarSearch: React.FC<TopbarSearchProps> = ({ onOpen }) => {
  return (
    <button
      type="button"
      className="ds-topbar-search"
      role="search"
      aria-label="Mở bảng lệnh nhanh"
      onClick={onOpen}
    >
      <AppIcon name="search" className="ds-topbar-search-icon" aria-hidden />
      <span className="ds-topbar-search-copy">
        <span className="ds-topbar-search-label">Tìm module, thao tác, cấu hình</span>
      </span>
      <span className="ds-topbar-search-shortcuts" aria-hidden>
        <kbd className="ds-topbar-search-shortcut">Ctrl K</kbd>
      </span>
    </button>
  );
};
