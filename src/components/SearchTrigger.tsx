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
      aria-label="Open command palette"
    >
      <SearchOutlined className="search-trigger-icon" />
      <span className="search-trigger-placeholder">Search...</span>
      <span className="search-trigger-hint" aria-hidden>
        {shortcutLabel}
      </span>
    </button>
  );
});

SearchTrigger.displayName = 'SearchTrigger';
