import {
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SolutionOutlined,
  ToolOutlined,
  UserOutlined,
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
  group: 'overview' | 'identity' | 'governance';
}

const navItems: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined />, group: 'overview' },
  { key: '/services', label: 'Services', icon: <ToolOutlined />, group: 'overview' },
  { key: '/users', label: 'Users', icon: <UserOutlined />, group: 'identity' },
  { key: '/hr-employees', label: 'HR Employees', icon: <SolutionOutlined />, group: 'identity' },
  { key: '/audit', label: 'Audit Logs', icon: <FileTextOutlined />, group: 'governance' },
];

const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/hr-employees': 'HR Employees',
  '/audit': 'Audit Logs',
  '/services': 'Services',
};

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
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
        key: 'group-overview',
        label: 'Overview',
        children: navItems.filter((item) => item.group === 'overview').map(toChild),
      },
      {
        type: 'group',
        key: 'group-identity',
        label: 'Identity & Organization',
        children: navItems.filter((item) => item.group === 'identity').map(toChild),
      },
      {
        type: 'group',
        key: 'group-governance',
        label: 'Governance',
        children: navItems.filter((item) => item.group === 'governance').map(toChild),
      },
    ];
  }, []);

  const selectedMenu =
    navItems.find((item) =>
      item.key === '/'
        ? location.pathname === '/'
        : location.pathname === item.key || location.pathname.startsWith(`${item.key}/`),
    )?.key ?? '/';

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
          items={menuItems}
          onClick={({ key }) => navigate(String(key))}
        />
        <div className="app-sider-footer">
          <Text type="secondary">System context</Text>
          <Text>Environment: {environment}</Text>
          <Text type="secondary">Role-aware actions enabled by policy</Text>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space size={12}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((prev) => !prev)}
            />
            <Badge
              color={environment === 'PROD' ? 'red' : environment === 'STAGING' ? 'gold' : 'green'}
            />
            <Text strong>{environment}</Text>
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
