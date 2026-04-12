import React from 'react';

export const TopbarSearch: React.FC = () => {
  return (
    <div className="ds-topbar-search" role="search" aria-label="Site search">
      <input
        id="topbar-search"
        className="ds-input"
        placeholder="Tìm kiếm..."
        aria-label="Tìm kiếm"
        type="search"
      />
    </div>
  );
};
