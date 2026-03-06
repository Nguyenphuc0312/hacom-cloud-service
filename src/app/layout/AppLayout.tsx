import {
  AlertOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Typography,
} from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { LoadingState } from '@/components/QueryStates';
import { useCurrentUser } from '@/app/useCurrentUser';
import { useAuthStore } from '@/store/authStore';
import { hasMinimumRole } from '@/utils/role';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  minimumRole: 'viewer' | 'admin' | 'superadmin';
}

const navItems: NavItem[] = [
  { key: '/', label: 'Overview', icon: <DashboardOutlined />, minimumRole: 'viewer' },
  { key: '/services', label: 'Services', icon: <ToolOutlined />, minimumRole: 'viewer' },
  {
    key: '/performance',
    label: 'Performance',
    icon: <BarChartOutlined />,
    minimumRole: 'viewer',
  },
  {
    key: '/settings/smtp',
    label: 'SMTP Settings',
    icon: <SettingOutlined />,
    minimumRole: 'admin',
  },
  { key: '/alerts', label: 'Alerts', icon: <AlertOutlined />, minimumRole: 'viewer' },
  { key: '/audit', label: 'Audit Log', icon: <FileTextOutlined />, minimumRole: 'admin' },
  {
    key: '/admin-users',
    label: 'Admin Users',
    icon: <TeamOutlined />,
    minimumRole: 'superadmin',
  },
];

const breadcrumbNameMap: Record<string, string> = {
  '/': 'Overview',
  '/services': 'Services',
  '/performance': 'Performance',
  '/settings': 'Settings',
  '/settings/smtp': 'SMTP',
  '/alerts': 'Alerts',
  '/audit': 'Audit Logs',
  '/admin-users': 'Admin Users',
};

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const clearAuth = useAuthStore((state) => state.clearAuth);
  const { user, isLoading } = useCurrentUser();

  const allowedItems = useMemo<ItemType[]>(() => {
    return navItems
      .filter((item) => hasMinimumRole(user?.role, item.minimumRole))
      .map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
      }));
  }, [user?.role]);

  const selectedMenu =
    navItems.find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))
      ?.key ?? '/';

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

  const environment = (import.meta.env.VITE_APP_ENV ?? 'DEV').toUpperCase();

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
        className="app-sider"
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
      >
        <div className="brand">{collapsed ? 'CA' : 'Chat Admin'}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          items={allowedItems}
          onClick={({ key }) => navigate(String(key))}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((prev) => !prev)}
            />
            <Badge color={environment === 'PROD' ? 'red' : environment === 'STAGING' ? 'gold' : 'green'} />
            <Text strong>{environment}</Text>
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
                <Text type="secondary">{user?.role ?? 'unknown'}</Text>
              </div>
            </Space>
          </Dropdown>
        </Header>
        <Content className="app-content">
          <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
