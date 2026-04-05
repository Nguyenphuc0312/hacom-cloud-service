import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Layout,
  Menu,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { LoadingState } from '@/components/QueryStates';
import { SystemDegradedBanner } from '@/components/SystemDegradedBanner';
import { useCurrentUser } from '@/app/useCurrentUser';
import { useAuthStore } from '@/store/authStore';
import { toDisplayRole } from '@/utils/role';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  group: 'dashboard' | 'users' | 'services' | 'system';
}

const navItems: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined />, group: 'dashboard' },
  { key: '/users', label: 'Users', icon: <TeamOutlined />, group: 'users' },
  { key: '/hr-employees', label: 'HR Employees', icon: <SolutionOutlined />, group: 'users' },
  {
    key: '/services/smtp',
    label: 'SMTP Settings',
    icon: <MailOutlined />,
    group: 'services',
  },
  {
    key: '/services/email-templates',
    label: 'Email Templates',
    icon: <FileTextOutlined />,
    group: 'services',
  },
  {
    key: '/services/health',
    label: 'Service Health',
    icon: <SafetyCertificateOutlined />,
    group: 'system',
  },
  { key: '/audit', label: 'Audit Logs', icon: <AuditOutlined />, group: 'system' },
];

const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/hr-employees': 'HR Employees',
  '/audit': 'Audit Logs',
  '/services': 'Services',
  '/services/smtp': 'SMTP Settings',
  '/services/email-templates': 'Email Templates',
  '/services/health': 'Service Health',
};

const pickSelectedMenuKey = (pathname: string): string => {
  if (pathname === '/') {
    return '/';
  }

  if (pathname.startsWith('/users')) {
    return '/users';
  }

  if (pathname.startsWith('/hr-employees')) {
    return '/hr-employees';
  }

  if (pathname.startsWith('/services/email-templates')) {
    return '/services/email-templates';
  }

  if (pathname.startsWith('/services/smtp')) {
    return '/services/smtp';
  }

  if (pathname.startsWith('/services/health') || pathname.startsWith('/services')) {
    return '/services/health';
  }

  if (pathname.startsWith('/audit')) {
    return '/audit';
  }

  return '/';
};

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [quickNavValue, setQuickNavValue] = useState<string | undefined>();
  const navigate = useNavigate();
  const location = useLocation();

  const clearAuth = useAuthStore((state) => state.clearAuth);
  const {
    user,
    isLoading,
    isAuthServiceUnavailable,
    currentUserErrorMessage,
    retryCurrentUser,
    isRetryingCurrentUser,
  } = useCurrentUser();

  const menuItems = useMemo<ItemType[]>(() => {
    const toChild = (item: NavItem): ItemType => ({
      key: item.key,
      icon: item.icon,
      label: item.label,
    });

    return [
      {
        type: 'group',
        key: 'group-dashboard',
        label: 'Dashboard',
        children: navItems.filter((item) => item.group === 'dashboard').map(toChild),
      },
      {
        type: 'group',
        key: 'group-users',
        label: 'Users',
        children: navItems.filter((item) => item.group === 'users').map(toChild),
      },
      {
        type: 'group',
        key: 'group-services',
        label: 'Services',
        children: navItems.filter((item) => item.group === 'services').map(toChild),
      },
      {
        type: 'group',
        key: 'group-system',
        label: 'System',
        children: navItems.filter((item) => item.group === 'system').map(toChild),
      },
    ];
  }, []);

  const selectedMenu = pickSelectedMenuKey(location.pathname);

  const quickSearchOptions = useMemo(
    () =>
      navItems.map((item) => ({
        value: item.key,
        title: item.label,
        label: (
          <Space size={8}>
            {item.icon}
            <span>{item.label}</span>
          </Space>
        ),
      })),
    [],
  );

  const breadcrumbItems = useMemo(() => {
    const pathSnippets = location.pathname.split('/').filter(Boolean);
    const paths = pathSnippets.map((_, index) => `/${pathSnippets.slice(0, index + 1).join('/')}`);

    const items = [{ title: breadcrumbNameMap['/'] }];

    paths.forEach((path) => {
      if (path !== '/' && breadcrumbNameMap[path]) {
        items.push({ title: breadcrumbNameMap[path] });
      }
    });

    return items;
  }, [location.pathname]);

  const logout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const environment = (import.meta.env.VITE_APP_ENV ?? 'server-test').toUpperCase();
  const envColor =
    environment === 'PROD' || environment === 'PRODUCTION'
      ? 'red'
      : environment === 'STAGING'
        ? 'gold'
        : 'blue';

  if (isLoading) {
    return <LoadingState tip="Đang khởi tạo phiên làm việc..." />;
  }

  return (
    <Layout className="app-layout">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        collapsedWidth={80}
        className="app-sider"
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
      >
        <div className="brand">{collapsed ? 'CA' : 'Chat Admin Console'}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          items={menuItems}
          aria-label="Main admin navigation"
          onClick={({ key }) => navigate(String(key))}
        />
        <div className="app-sider-footer">
          <Text type="secondary">System context</Text>
          <Text>Environment: {environment}</Text>
          <Text type="secondary">RBAC + release policy enforced</Text>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space size={12}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            />
            <Select
              className="header-search"
              showSearch
              allowClear
              placeholder="Quick navigate"
              value={quickNavValue}
              options={quickSearchOptions}
              filterOption={(input, option) =>
                String(option?.title ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              onSelect={(value) => {
                setQuickNavValue(undefined);
                navigate(value);
              }}
              onClear={() => setQuickNavValue(undefined)}
              suffixIcon={<SearchOutlined />}
            />
            <Tag color={envColor}>{environment}</Tag>
            <Tag color={isAuthServiceUnavailable ? 'gold' : 'green'}>
              {isAuthServiceUnavailable ? 'Auth integration degraded' : 'Auth integration healthy'}
            </Tag>
          </Space>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Logout',
                  onClick: logout,
                },
              ],
            }}
          >
            <Space className="user-chip">
              <Avatar>{user?.email?.charAt(0).toUpperCase() ?? 'A'}</Avatar>
              <div>
                <Text>{user?.email ?? '-'}</Text>
                <br />
                <Text type="secondary">
                  {user?.username ?? 'admin'} · {toDisplayRole(user?.role)}
                </Text>
              </div>
            </Space>
          </Dropdown>
        </Header>
        <Content className="app-content">
          <SystemDegradedBanner
            visible={isAuthServiceUnavailable}
            title="Admin auth integration degraded"
            description={
              currentUserErrorMessage ?? 'Cannot verify current admin profile right now.'
            }
            onRetry={retryCurrentUser}
            retrying={isRetryingCurrentUser}
          />
          <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
