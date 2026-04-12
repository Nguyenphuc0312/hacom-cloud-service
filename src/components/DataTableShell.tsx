import React from 'react';
import clsx from 'clsx';

interface DataTableShellProps {
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  emptyState?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const DataTableShell: React.FC<DataTableShellProps> = ({
  title,
  toolbar,
  meta,
  footer,
  loading = false,
  emptyState,
  children,
  className,
}) => {
  const ariaLabel = typeof title === 'string' ? title : 'Data table';

  return (
    <div
      className={clsx('ds-table-shell', className)}
      role="region"
      aria-label={ariaLabel}
      aria-busy={loading ? 'true' : 'false'}
    >
      {(title || toolbar || meta) && (
        <div className="ds-table-shell-header">
          <div style={{ flex: 1 }}>
            {title && <div className="ds-table-shell-title">{title}</div>}
            {meta && <div className="ds-table-shell-meta">{meta}</div>}
          </div>
          {toolbar && <div className="ds-table-shell-toolbar">{toolbar}</div>}
        </div>
      )}

      <div className="ds-table-shell-body">
        {loading ? (
          <div className="ds-table-loading-state" role="status" aria-live="polite">
            <div className="ds-table-loading-skeleton" />
            <div className="ds-table-loading-skeleton" />
            <div className="ds-table-loading-skeleton" />
          </div>
        ) : children ? (
          children
        ) : (
          emptyState || <div className="ds-table-empty-state">No data</div>
        )}
      </div>

      {footer && <div className="ds-table-shell-footer">{footer}</div>}
    </div>
  );
};

export default DataTableShell;
