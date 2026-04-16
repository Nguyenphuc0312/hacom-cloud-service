import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Space, Tabs, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { accessClient, authClient } from '@/api/clients';
import { getErrorMessage } from '@/api/error';
import { useAuthStore } from '@/store/authStore';

const { Title, Text } = Typography;

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const setAccess = useAuthStore((state) => state.setAccess);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [qrCode, setQrCode] = useState('');

  const from = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname ?? '/';
  }, [location.state]);

  const loginMutation = useMutation({
    mutationFn: authClient.login,
    onSuccess: async (data) => {
      setAuth({ accessToken: data.accessToken, user: data.user ?? null });

      try {
        const access = await accessClient.getCurrentStatus();
        setAccess(access);

        if (access.status !== 'approved') {
          navigate('/access', { replace: true });
          return;
        }

        if (!data.user) {
          const me = await authClient.me();
          setUser(me);
        }

        message.success('Đăng nhập thành công.');
        navigate(from, { replace: true });
      } catch (error) {
        clearAuth();
        message.error(getErrorMessage(error));
      }
    },
    onError: (error) => {
      message.error(getErrorMessage(error));
    },
  });

  const onFinish = (values: LoginFormValues) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      message.error(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
      return;
    }

    loginMutation.mutate(parsed.data);
  };

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <Card className="login-card" bordered={false}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Title level={3} style={{ marginBottom: 0 }}>
            Chat Admin Console
          </Title>
          <Text type="secondary">
            Đăng nhập để quản trị người dùng, hạ tầng dịch vụ và cấu hình hệ thống.
          </Text>
        </Space>

        <Tabs
          defaultActiveKey="email"
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'email',
              label: 'Email & Password',
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
                    rules={[{ required: true, message: 'Vui lòng nhập email.' }]}
                  >
                    <Input placeholder="admin@company.com" size="large" autoComplete="email" />
                  </Form.Item>

                  <Form.Item
                    label="Password"
                    name="password"
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu.' }]}
                  >
                    <Input.Password size="large" autoComplete="current-password" />
                  </Form.Item>

                  {loginMutation.isError ? (
                    <Alert
                      type="error"
                      showIcon
                      message={getErrorMessage(loginMutation.error)}
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
              label: 'QR Login',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message="QR login"
                    description="Dùng app nội bộ để quét QR hoặc dán mã pairing để đăng nhập nhanh không cần nhập mật khẩu."
                  />
                  <div className="login-qr-placeholder" aria-label="QR login placeholder">
                    <Text strong>QR Session</Text>
                    <Text type="secondary">Quét QR bằng ứng dụng mobile admin</Text>
                  </div>
                  <Input
                    value={qrCode}
                    onChange={(event) => setQrCode(event.target.value)}
                    placeholder="Dán mã pairing từ ứng dụng mobile"
                    size="large"
                  />
                  <Button
                    type="primary"
                    block
                    size="large"
                    onClick={() => {
                      if (!qrCode.trim()) {
                        message.warning('Vui lòng nhập mã pairing QR.');
                        return;
                      }
                      message.info(
                        'QR login sẽ được bật khi auth-service phát hành endpoint tương ứng.',
                      );
                    }}
                  >
                    Xác thực QR
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
