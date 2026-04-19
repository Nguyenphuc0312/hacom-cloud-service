import { SearchOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface CommandPaletteTriggerProps {
  onOpen: () => void;
}

export const CommandPaletteTrigger = ({ onOpen }: CommandPaletteTriggerProps) => {
  return (
    <Button className="command-palette-trigger" onClick={onOpen} aria-label="Mở bảng lệnh nhanh">
      <SearchOutlined />
      <span className="command-palette-trigger-label">Tìm kiếm</span>
      <span className="command-palette-trigger-hint">Ctrl/Cmd + K</span>
    </Button>
  );
};
