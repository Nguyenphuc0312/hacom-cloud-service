import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface NavItem {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  section: SidebarSectionKey;
  route: string;
  badge?: ReactNode;
  roles?: string[];
  children?: NavItem[];
}

export type SidebarSectionKey =
  | 'overview'
  | 'users'
  | 'chat'
  | 'security'
  | 'settings'
  | 'monitoring'
  | 'support';

export interface SidebarSection {
  key: SidebarSectionKey;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { key: 'overview', label: 'Tổng quan', description: 'Snapshot', icon: <DashboardOutlined /> },
  {
    key: 'users',
    label: 'Người dùng & Nhân sự',
    description: 'Identity',
    icon: <TeamOutlined />,
  },
  { key: 'chat', label: 'Hệ thống chat', description: 'Messaging', icon: <MailOutlined /> },
  {
    key: 'security',
    label: 'Phân quyền & Bảo mật',
    description: 'Security',
    icon: <SafetyCertificateOutlined />,
  },
  {
    key: 'settings',
    label: 'Cấu hình',
    description: 'Configuration',
    icon: <FileTextOutlined />,
  },
  {
    key: 'monitoring',
    label: 'Theo dõi & Logs',
    description: 'Observability',
    icon: <AuditOutlined />,
  },
  { key: 'support', label: 'Hỗ trợ / Tài liệu', description: 'Support', icon: <SolutionOutlined /> },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Operational overview and service posture',
    icon: <DashboardOutlined />,
    section: 'overview',
    route: '/',
  },
  {
    key: 'users',
    label: 'Người dùng',
    description: 'Admin accounts, access state, and sessions',
    icon: <TeamOutlined />,
    section: 'users',
    route: '/users',
    children: [
      {
        key: 'hr-employees',
        label: 'Nhân sự',
        description: 'Employee records and account provisioning',
        icon: <SolutionOutlined />,
        section: 'users',
        route: '/hr-employees',
      },
    ],
  },
  {
    key: 'smtp',
    label: 'SMTP',
    description: 'Mail transport configuration and runtime activation',
    icon: <MailOutlined />,
    section: 'chat',
    route: '/services/smtp',
  },
  {
    key: 'email-templates',
    label: 'Email Templates',
    description: 'Draft, preview, publish, and rollback email content',
    icon: <FileTextOutlined />,
    section: 'chat',
    route: '/services/email-templates',
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    description: 'Trace admin actions, requests, and security events',
    icon: <AuditOutlined />,
    section: 'security',
    route: '/audit',
  },
  {
    key: 'service-health',
    label: 'Service Health',
    description: 'Dependency health, latency, and runtime status',
    icon: <SafetyCertificateOutlined />,
    section: 'monitoring',
    route: '/services/health',
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Người dùng',
  '/hr-employees': 'Nhân sự',
  '/audit': 'Audit Logs',
  '/services': 'Dịch vụ',
  '/services/smtp': 'SMTP',
  '/services/email-templates': 'Email Templates',
  '/services/health': 'Service Health',
};

const flattenNavItems = (items: NavItem[]): NavItem[] =>
  items.flatMap((item) => [item, ...(item.children ? flattenNavItems(item.children) : [])]);

export const resolveNavigationContext = (pathname: string) => {
  const item =
    flattenNavItems(navItems)
      .sort((left, right) => right.route.length - left.route.length)
      .find((entry) =>
        entry.route === '/'
          ? pathname === '/'
          : pathname === entry.route || pathname.startsWith(`${entry.route}/`),
      ) ?? null;

  const section = item ? SIDEBAR_SECTIONS.find((entry) => entry.key === item.section) ?? null : null;

  return {
    item,
    section,
    title: item?.label ?? 'Dashboard',
    description: item?.description ?? 'Operational visibility and control surface',
    sectionLabel: section?.label ?? 'Tổng quan',
    sectionDescription: section?.description ?? 'Workspace',
  };
};

export const pickSelectedMenuKey = (pathname: string): string => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/hr-employees')) return 'hr-employees';
  if (pathname.startsWith('/services/email-templates')) return 'email-templates';
  if (pathname.startsWith('/services/smtp')) return 'smtp';
  if (pathname.startsWith('/services/health') || pathname.startsWith('/services'))
    return 'service-health';
  if (pathname.startsWith('/audit')) return 'audit';
  return 'dashboard';
};

export type CommandCategory = 'Navigation' | 'System' | 'Settings';

export interface CommandRouteItem {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  icon: ReactNode;
  keywords: string[];
  route?: string;
  disabled?: boolean;
}

export const commandRouteItems: CommandRouteItem[] = [
  {
    id: 'go-dashboard',
    label: 'Dashboard',
    description: 'Overview metrics and system snapshot',
    category: 'Navigation',
    icon: <DashboardOutlined />,
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-users',
    label: 'Users / Accounts',
    description: 'Manage admin users and permissions',
    category: 'Navigation',
    icon: <TeamOutlined />,
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-hr-employees',
    label: 'HR Employees',
    description: 'Review and manage employee records',
    category: 'Navigation',
    icon: <SolutionOutlined />,
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-smtp-settings',
    label: 'SMTP Settings',
    description: 'Configure email transport and credentials',
    category: 'Settings',
    icon: <MailOutlined />,
    keywords: ['smtp', 'mail', 'settings'],
    route: '/services/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Email Templates',
    description: 'Manage service email templates',
    category: 'Settings',
    icon: <FileTextOutlined />,
    keywords: ['email', 'templates', 'content'],
    route: '/services/email-templates',
  },
  {
    id: 'go-service-health',
    label: 'Service Health / Monitoring',
    description: 'Check integrations and API health status',
    category: 'System',
    icon: <SafetyCertificateOutlined />,
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-logs',
    label: 'Audit Logs',
    description: 'Open audit logs and security events',
    category: 'Navigation',
    icon: <AuditOutlined />,
    keywords: ['logs', 'audit', 'events'],
    route: '/audit',
  },
];
