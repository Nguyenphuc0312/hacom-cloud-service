import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Form, Input, Space, Tabs, Tooltip, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { authClient } from '@/api/clients/authClient/authClient';
import { currentAdminClient } from '@/api/clients/currentAdminClient/currentAdminClient';
import {
  getAdminLoginErrorMessage,
  getErrorMessage,
  isAdminAccessIpPendingError,
} from '@/api/error/error';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE } from '@/config/passwordPolicy';
import { useAuthStore } from '@/store/authStore/authStore';
import './LoginPage.css';

const { Title, Text } = Typography;

const loginSchema = z.object({
  email: z.string().email('Nhập email hợp lệ.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const REMEMBER_ME_STORAGE_KEY = 'chat-admin-remember-me';

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  // Remember me state - persist preference separately
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
    if (stored === null) return false;
    try {
      return JSON.parse(stored) === true;
    } catch {
      return false;
    }
  });

  const [qrCode, setQrCode] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState<string>('');

  // Load saved email if remember me was checked
  useEffect(() => {
    if (rememberMe) {
      const savedEmailValue = localStorage.getItem('chat-admin-saved-email');
      if (savedEmailValue) {
        setSavedEmail(savedEmailValue);
      }
    }
  }, [rememberMe]);

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

        // Save remember me preference
        localStorage.setItem(REMEMBER_ME_STORAGE_KEY, JSON.stringify(rememberMe));

        // Save email if remember me is checked
        if (rememberMe) {
          const emailInput = document.querySelector<HTMLInputElement>('input[type="email"]');
          if (emailInput?.value) {
            localStorage.setItem('chat-admin-saved-email', emailInput.value);
          }
        } else {
          localStorage.removeItem('chat-admin-saved-email');
        }

        setAuth({ accessToken: data.accessToken, user: admin, rememberMe });
        setAdminLoginError(null);
        message.success('Đăng nhập thành công.');
        navigate(from, { replace: true });
      } catch (error) {
        if (isAdminAccessIpPendingError(error)) {
          localStorage.setItem(REMEMBER_ME_STORAGE_KEY, JSON.stringify(rememberMe));
          setAuth({ accessToken: data.accessToken, user: data.user ?? null, rememberMe });
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

  const handleRememberMeChange = (e: { target: { checked: boolean } }) => {
    setRememberMe(e.target.checked);
    // Save preference immediately
    localStorage.setItem(REMEMBER_ME_STORAGE_KEY, JSON.stringify(e.target.checked));
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
          <Text type="secondary">
            Đăng nhập để quản lý người dùng, dịch vụ và cấu hình hệ thống.
          </Text>
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
                  initialValues={{
                    email: savedEmail,
                  }}
                >
                  <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Nhập email.' }]}>
                    <Input
                      placeholder="admin@company.com"
                      size="large"
                      autoComplete="email"
                      defaultValue={savedEmail}
                    />
                  </Form.Item>

                  <Form.Item
                    label="Mật khẩu"
                    name="password"
                    rules={[{ required: true, message: 'Nhập mật khẩu.' }]}
                  >
                    <Input.Password size="large" autoComplete="current-password" />
                  </Form.Item>

                  <div className="login-remember-me-row">
                    <Checkbox
                      checked={rememberMe}
                      onChange={handleRememberMeChange}
                      aria-label="Ghi nhớ đăng nhập"
                    >
                      Ghi nhớ đăng nhập
                    </Checkbox>
                    <Tooltip
                      title="Khi bật, bạn sẽ duy trì phiên đăng nhập lâu hơn trên thiết bị này. Không nên dùng trên máy công cộng."
                      placement="top"
                    >
                      <Button type="text" size="small" icon="?" className="login-remember-tooltip-btn" />
                    </Tooltip>
                  </div>

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
