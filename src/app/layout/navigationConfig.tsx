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
  icon?: ReactNode;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { key: 'overview', label: 'Tổng quan', icon: <DashboardOutlined /> },
  { key: 'users', label: 'Người dùng & Nhân sự', icon: <TeamOutlined /> },
  { key: 'chat', label: 'Hệ thống chat', icon: <MailOutlined /> },
  { key: 'security', label: 'Phân quyền & Bảo mật', icon: <SafetyCertificateOutlined /> },
  { key: 'settings', label: 'Cấu hình', icon: <FileTextOutlined /> },
  { key: 'monitoring', label: 'Theo dõi & Logs', icon: <AuditOutlined /> },
  { key: 'support', label: 'Hỗ trợ / Tài liệu', icon: <SolutionOutlined /> },
];

export const navItems: NavItem[] = [
  // Tổng quan
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardOutlined />,
    section: 'overview',
    route: '/',
  },
  // Người dùng & nhân sự
  {
    key: 'users',
    label: 'Người dùng',
    icon: <TeamOutlined />,
    section: 'users',
    route: '/users',
    children: [
      {
        key: 'hr-employees',
        label: 'Nhân sự',
        icon: <SolutionOutlined />,
        section: 'users',
        route: '/hr-employees',
      },
    ],
  },
  // Hệ thống chat
  {
    key: 'smtp',
    label: 'SMTP',
    icon: <MailOutlined />,
    section: 'chat',
    route: '/services/smtp',
  },
  {
    key: 'email-templates',
    label: 'Email Templates',
    icon: <FileTextOutlined />,
    section: 'chat',
    route: '/services/email-templates',
  },
  // Phân quyền & bảo mật
  {
    key: 'audit',
    label: 'Audit Logs',
    icon: <AuditOutlined />,
    section: 'security',
    route: '/audit',
  },
  // Cấu hình
  // (Có thể thêm các mục cấu hình khác vào đây)
  // Theo dõi & logs
  {
    key: 'service-health',
    label: 'Service Health',
    icon: <SafetyCertificateOutlined />,
    section: 'monitoring',
    route: '/services/health',
  },
  // Hỗ trợ / tài liệu (dự phòng, có thể thêm sau)
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
