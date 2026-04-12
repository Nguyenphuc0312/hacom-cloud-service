import React from 'react';
import clsx from 'clsx';

interface DataTableShellProps {
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const DataTableShell: React.FC<DataTableShellProps> = ({
  title,
  toolbar,
  children,
  footer,
  className,
}) => (
  <div className={clsx('ds-table-shell', className)}>
    {(title || toolbar) && (
      <div className="ds-table-shell-header">
        {title && <div className="ds-table-shell-title">{title}</div>}
        {toolbar && <div className="ds-table-shell-toolbar">{toolbar}</div>}
      </div>
    )}
    <div className="ds-table-shell-body">{children}</div>
    {footer && <div className="ds-table-shell-footer">{footer}</div>}
  </div>
);
