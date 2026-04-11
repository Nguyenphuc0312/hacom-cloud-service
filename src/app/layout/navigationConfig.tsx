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
  group: 'dashboard' | 'users' | 'services' | 'system';
}

export const navItems: NavItem[] = [
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

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/hr-employees': 'HR Employees',
  '/audit': 'Audit Logs',
  '/services': 'Services',
  '/services/smtp': 'SMTP Settings',
  '/services/email-templates': 'Email Templates',
  '/services/health': 'Service Health',
};

export const pickSelectedMenuKey = (pathname: string): string => {
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
