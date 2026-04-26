import { Button, Result, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

import { PageShell } from '@/components/PageShell';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <PageShell
      eyebrow="Điều hướng"
      title="Không tìm thấy trang"
      description="Route quản trị này không tồn tại trong panel."
      headerExtra={<Button onClick={() => navigate('/')}>Về Dashboard</Button>}
    >
      <Result
        status="404"
        title="404 Không tìm thấy"
        subTitle="Kiểm tra URL hoặc quay lại dashboard quản trị."
        extra={
          <Space>
            <Button onClick={() => navigate(-1)}>Quay lại</Button>
            <Button type="primary" onClick={() => navigate('/')}>
              Về Dashboard
            </Button>
          </Space>
        }
      />
    </PageShell>
  );
};
