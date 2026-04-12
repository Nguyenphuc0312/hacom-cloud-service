import React from 'react';

export const TableEmptyState: React.FC<{ description?: string }> = ({ description }) => (
  <div className="ds-table-empty-state">
    <span className="ds-table-empty-icon">📄</span>
    <div className="ds-table-empty-desc">{description || 'Chưa có dữ liệu'}</div>
  </div>
);
