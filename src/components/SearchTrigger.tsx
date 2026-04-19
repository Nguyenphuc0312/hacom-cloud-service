import { SearchOutlined } from '@ant-design/icons';
import { memo } from 'react';

interface SearchTriggerProps {
  onOpen: () => void;
  shortcutLabel?: string;
}

export const SearchTrigger = memo(({ onOpen, shortcutLabel = 'Ctrl + K' }: SearchTriggerProps) => {
  return (
    <button
      type="button"
      className="search-trigger"
      onClick={onOpen}
      aria-label="Mở bảng lệnh nhanh"
    >
      <SearchOutlined className="search-trigger-icon" />
      <span className="search-trigger-placeholder">Tìm kiếm...</span>
      <span className="search-trigger-hint" aria-hidden>
        {shortcutLabel}
      </span>
    </button>
  );
});

SearchTrigger.displayName = 'SearchTrigger';
