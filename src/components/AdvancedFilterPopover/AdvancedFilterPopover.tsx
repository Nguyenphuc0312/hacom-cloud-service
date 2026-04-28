import type { ReactNode } from 'react';
import { Button, Popover } from 'antd';

import { AppIcon } from '@/components/AppIcon/AppIcon';

interface AdvancedFilterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  label?: string;
}

export const AdvancedFilterPopover = ({
  open,
  onOpenChange,
  children,
  label = 'Nâng cao',
}: AdvancedFilterPopoverProps) => (
  <Popover
    trigger="click"
    placement="bottomRight"
    open={open}
    onOpenChange={onOpenChange}
    content={children}
  >
    <Button aria-label="Mở bộ lọc nâng cao" icon={<AppIcon name="sliders" size={14} aria-hidden />}>
      {label}
    </Button>
  </Popover>
);
