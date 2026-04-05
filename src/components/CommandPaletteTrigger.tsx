import { SearchOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface CommandPaletteTriggerProps {
  onOpen: () => void;
}

export const CommandPaletteTrigger = ({ onOpen }: CommandPaletteTriggerProps) => {
  return (
    <Button className="command-palette-trigger" onClick={onOpen} aria-label="Open command palette">
      <SearchOutlined />
      <span className="command-palette-trigger-label">Search</span>
      <span className="command-palette-trigger-hint">Ctrl/Cmd + K</span>
    </Button>
  );
};
