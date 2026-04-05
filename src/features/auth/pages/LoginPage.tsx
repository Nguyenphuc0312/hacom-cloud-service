import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { authClient } from '@/api/clients';
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
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const from = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname ?? '/';
  }, [location.state]);

  const loginMutation = useMutation({
    mutationFn: authClient.login,
    onSuccess: async (data) => {
      // Persist token first so subsequent /admin/me call carries Bearer auth.
      setAuth({ accessToken: data.accessToken, user: data.user ?? null });

      try {
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
        <Title level={3}>Chat Admin Panel</Title>
        <Text type="secondary">Đăng nhập để quản trị hệ thống chat microservices</Text>
        <Form<LoginFormValues>
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
          style={{ marginTop: 20 }}
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
            Login
          </Button>
        </Form>
      </Card>
    </div>
  );
};
