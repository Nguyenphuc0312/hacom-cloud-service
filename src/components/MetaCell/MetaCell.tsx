import type { ReactNode } from 'react';
import clsx from 'clsx';

interface MetaCellProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}

export const MetaCell = ({ primary = '-', secondary, className }: MetaCellProps) => (
  <span className={clsx('ds-meta-cell', className)}>
    <strong title={typeof primary === 'string' ? primary : undefined}>{primary}</strong>
    {secondary ? (
      <small title={typeof secondary === 'string' ? secondary : undefined}>{secondary}</small>
    ) : null}
  </span>
);
