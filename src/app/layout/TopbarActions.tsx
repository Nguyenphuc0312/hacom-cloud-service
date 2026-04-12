import React from 'react';

export const TopbarActions: React.FC = () => {
  return (
    <div className="ds-topbar-actions">
      {/* Example icon buttons */}
      <button className="ds-btn ds-btn--icon" aria-label="Notifications">
        <span className="ds-icon">🔔</span>
      </button>
      <button className="ds-btn ds-btn--icon" aria-label="Quick actions">
        <span className="ds-icon">⚡</span>
      </button>
    </div>
  );
};
