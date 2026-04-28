import { Drawer, Empty, Space } from 'antd';

import { maskSecrets } from '@/utils/mask/mask';

import './../AppDrawer/AppDrawer.css';
interface JsonDiffDrawerProps {
  open: boolean;
  title?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  onClose: () => void;
}

const JsonBlock = ({ data }: { data?: Record<string, unknown> | null }) => {
  if (!data) {
    return <Empty description="Chưa có dữ liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <pre className="json-block">{JSON.stringify(maskSecrets(data), null, 2)}</pre>
  );
};

export const JsonDiffDrawer = ({
  open,
  title = 'So sánh thay đổi',
  before,
  after,
  onClose,
}: JsonDiffDrawerProps) => {
  return (
    <Drawer
      open={open}
      width={920}
      title={title}
      onClose={onClose}
      destroyOnClose
      className="json-diff-drawer"
    >
      <Space size={16} style={{ width: '100%' }} align="start" className="json-diff-grid">
        <div className="json-panel">
          <h4>Trước</h4>
          <JsonBlock data={before} />
        </div>
        <div className="json-panel">
          <h4>Sau</h4>
          <JsonBlock data={after} />
        </div>
      </Space>
    </Drawer>
  );
};
