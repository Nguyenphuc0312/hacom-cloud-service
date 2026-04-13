import React from 'react';
import clsx from 'clsx';

interface DetailPanelProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  className?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  open,
  title,
  onClose,
  children,
  width = 420,
  className,
}) => {
  if (!open) return null;
  return (
    <aside className={clsx('ds-detail-panel', className)} style={{ width }}>
      <div className="ds-detail-panel-header">
        <span className="ds-detail-panel-title">{title}</span>
        <button className="ds-detail-panel-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
      </div>
      <div className="ds-detail-panel-body">{children}</div>
    </aside>
  );
};
