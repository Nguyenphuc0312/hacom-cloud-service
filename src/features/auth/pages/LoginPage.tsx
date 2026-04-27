import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Tabs, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { authClient, currentAdminClient } from '@/api/clients';
import {
  getAdminLoginErrorMessage,
  getErrorMessage,
  isAdminAccessIpPendingError,
} from '@/api/error';
import { useAuthStore } from '@/store/authStore';

const { Title, Text } = Typography;

const loginSchema = z.object({
  email: z.string().email('Nhập email hợp lệ.'),
  password: z.string().min(1, 'Nhập mật khẩu.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [qrCode, setQrCode] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  const from = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname ?? '/';
  }, [location.state]);

  const loginMutation = useMutation({
    mutationFn: authClient.login,
    onSuccess: async (data) => {
      try {
        const admin = await currentAdminClient.getCurrentAdmin({
          skipAuthRedirect: true,
          headers: {
            Authorization: `Bearer ${data.accessToken}`,
          },
        });

        setAuth({ accessToken: data.accessToken, user: admin });
        setAdminLoginError(null);
        message.success('Đăng nhập thành công.');
        navigate(from, { replace: true });
      } catch (error) {
        if (isAdminAccessIpPendingError(error)) {
          setAuth({ accessToken: data.accessToken, user: data.user ?? null });
          setAdminLoginError(null);
          message.info(getAdminLoginErrorMessage(error));
          navigate('/access', { replace: true });
          return;
        }

        clearAuth();
        const errorMessage = getAdminLoginErrorMessage(error);
        setAdminLoginError(errorMessage);
        message.error(errorMessage);
      }
    },
    onError: (error) => {
      const errorMessage = getErrorMessage(error);
      setAdminLoginError(errorMessage);
      message.error(errorMessage);
    },
  });

  const onFinish = (values: LoginFormValues) => {
    setAdminLoginError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu đăng nhập không hợp lệ.');
      return;
    }

    loginMutation.mutate(parsed.data);
  };

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  const formErrorMessage =
    adminLoginError ?? (loginMutation.isError ? getErrorMessage(loginMutation.error) : null);

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Title level={3} style={{ marginBottom: 0 }}>
            Bảng quản trị chat
          </Title>
          <Text type="secondary">Đăng nhập để quản lý người dùng, dịch vụ và cấu hình hệ thống.</Text>
        </Space>

        <Tabs
          defaultActiveKey="email"
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'email',
              label: 'Email và mật khẩu',
              children: (
                <Form<LoginFormValues>
                  layout="vertical"
                  requiredMark={false}
                  onFinish={onFinish}
                  style={{ marginTop: 8 }}
                >
                  <Form.Item
                    label="Email"
                    name="email"
                    rules={[{ required: true, message: 'Nhập email.' }]}
                  >
                    <Input placeholder="admin@company.com" size="large" autoComplete="email" />
                  </Form.Item>

                  <Form.Item
                    label="Mật khẩu"
                    name="password"
                    rules={[{ required: true, message: 'Nhập mật khẩu.' }]}
                  >
                    <Input.Password size="large" autoComplete="current-password" />
                  </Form.Item>

                  {formErrorMessage ? (
                    <Alert
                      type="error"
                      showIcon
                      message={formErrorMessage}
                      style={{ marginBottom: 12 }}
                    />
                  ) : null}

                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={loginMutation.isPending}
                  >
                    Đăng nhập
                  </Button>
                </Form>
              ),
            },
            {
              key: 'qr',
              label: 'Đăng nhập QR',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Đăng nhập QR"
                    description="Quét mã QR từ ứng dụng nội bộ hoặc dán mã ghép nối."
                  />
                  <div className="login-qr-placeholder" aria-label="Khu vực chờ đăng nhập QR">
                    <Text strong>Phiên QR</Text>
                    <Text type="secondary">Quét bằng ứng dụng admin trên di động</Text>
                  </div>
                  <Input
                    value={qrCode}
                    onChange={(event) => setQrCode(event.target.value)}
                    placeholder="Dán mã ghép nối từ ứng dụng di động"
                    size="large"
                  />
                  <Button
                    type="primary"
                    block
                    size="large"
                    onClick={() => {
                      if (!qrCode.trim()) {
                        message.warning('Nhập mã ghép nối QR.');
                        return;
                      }
                      message.info('Đăng nhập QR sẽ bật khi auth-service cung cấp endpoint.');
                    }}
                  >
                    Xác minh QR
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
