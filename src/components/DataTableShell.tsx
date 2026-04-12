import React from 'react';
import clsx from 'clsx';


interface DataTableShellProps {
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

  title,
  toolbar,
  meta,
  children,
  footer,
  className,
}) => (
  <div className={clsx('ds-table-shell', className)}>
    {(title || toolbar || meta) && (
      <div className="ds-table-shell-header">
        <div style={{ flex: 1 }}>
          {title && <div className="ds-table-shell-title">{title}</div>}
          {meta && <div className="ds-table-shell-meta">{meta}</div>}
        </div>
        {toolbar && <div className="ds-table-shell-toolbar">{toolbar}</div>}
      </div>
    )}
    <div className="ds-table-shell-body">{children}</div>
    {footer && <div className="ds-table-shell-footer">{footer}</div>}
  </div>
);
