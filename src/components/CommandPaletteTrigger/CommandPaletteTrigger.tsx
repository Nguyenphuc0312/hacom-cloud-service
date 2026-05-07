import { Button } from 'antd';

import { AppIcon } from '@/components/AppIcon/AppIcon';

interface CommandPaletteTriggerProps {
  onOpen: () => void;
}

export const CommandPaletteTrigger = ({ onOpen }: CommandPaletteTriggerProps) => {
  return (
    <Button className="command-palette-trigger" onClick={onOpen} aria-label="Mở bảng lệnh nhanh">
      <AppIcon name="search" size={14} />
      <span className="command-palette-trigger-label">Tìm kiếm</span>
      <span className="command-palette-trigger-hint">Ctrl/Cmd + K</span>
    </Button>
  );
};
