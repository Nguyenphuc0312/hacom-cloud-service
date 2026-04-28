import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { AppTooltip } from '@/components/AppTooltip/AppTooltip';

interface IconActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tooltip: ReactNode;
}

export const IconActionButton = ({
  icon,
  tooltip,
  type = 'button',
  className,
  'aria-label': ariaLabel,
  ...props
}: IconActionButtonProps) => (
  <AppTooltip title={tooltip}>
    <button
      type={type}
      className={['ds-icon-action-button', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel ?? (typeof tooltip === 'string' ? tooltip : undefined)}
      {...props}
    >
      {icon}
    </button>
  </AppTooltip>
);
