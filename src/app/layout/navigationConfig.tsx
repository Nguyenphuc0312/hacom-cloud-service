import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import type { Role } from '@/api/types';

export interface NavItem {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  section: SidebarSectionKey;
  route: string;
  badge?: ReactNode;
  roles?: Role[];
  children?: NavItem[];
}

export type SidebarSectionKey =
  | 'analytics'
  | 'users'
  | 'conversations'
  | 'system'
  | 'settings'
  | 'support';

export interface SidebarSection {
  key: SidebarSectionKey;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Overview and monitoring',
    icon: <DashboardOutlined />,
  },
  {
    key: 'users',
    label: 'Users',
    description: 'Identity and access',
    icon: <TeamOutlined />,
  },
  {
    key: 'conversations',
    label: 'Conversations',
    description: 'Messaging workflows',
    icon: <FileTextOutlined />,
  },
  {
    key: 'system',
    label: 'System',
    description: 'Health and audit',
    icon: <ThunderboltOutlined />,
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Infrastructure config',
    icon: <FileTextOutlined />,
  },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Production snapshot for system posture and next actions.',
    icon: <DashboardOutlined />,
    section: 'analytics',
    route: '/',
  },
  {
    key: 'monitoring-overview',
    label: 'Monitoring',
    description: 'Realtime health, failures, and dependency posture.',
    icon: <ThunderboltOutlined />,
    section: 'analytics',
    route: '/monitoring',
  },
  {
    key: 'authority',
    label: 'Admin Authority',
    description: 'Canonical admin roles and permission overrides.',
    icon: <KeyOutlined />,
    section: 'users',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'users',
    label: 'Users',
    description: 'Admin accounts, presence, and access state.',
    icon: <TeamOutlined />,
    section: 'users',
    route: '/users',
  },
  {
    key: 'hr-employees',
    label: 'HR Directory',
    description: 'Employee records, imports, and provisioning.',
    icon: <SolutionOutlined />,
    section: 'users',
    route: '/hr-employees',
  },
  {
    key: 'email-templates',
    label: 'Services',
    description: 'Service health, SMTP, and email template controls.',
    icon: <FileTextOutlined />,
    section: 'settings',
    route: '/services/health',
  },
  {
    key: 'access-requests',
    label: 'IP Access',
    description: 'Review pending, approved, and rejected IP requests.',
    icon: <SafetyCertificateOutlined />,
    section: 'system',
    route: '/access-requests',
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    description: 'Admin actions, requests, and security events.',
    icon: <AuditOutlined />,
    section: 'system',
    route: '/audit',
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/authority': 'Admin Authority',
  '/users': 'Users',
  '/hr-employees': 'HR Directory',
  '/access-requests': 'IP Access',
  '/audit': 'Audit Logs',
  '/monitoring': 'Monitoring',
  '/services': 'Services',
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
  const breadcrumbs = ['/', ...pathname.split('/').filter(Boolean).map((_segment, index, parts) => `/${parts.slice(0, index + 1).join('/')}`)]
    .map((route) => ({
      route,
      label:
        breadcrumbNameMap[route] ??
        (route.startsWith('/users/') ? 'User Detail' : route.startsWith('/services/') ? 'Service Detail' : null),
    }))
    .filter((entry): entry is { route: string; label: string } => Boolean(entry.label));

  return {
    item,
    section,
    title: item?.label ?? 'Dashboard',
    description: item?.description ?? 'Operational visibility and control surface',
    sectionLabel: section?.label ?? 'Analytics',
    sectionDescription: section?.description ?? 'Workspace',
    breadcrumbs,
  };
};

export const pickSelectedMenuKey = (pathname: string): string => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/monitoring')) return 'monitoring-overview';
  if (pathname.startsWith('/authority')) return 'authority';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/hr-employees')) return 'hr-employees';
  if (pathname.startsWith('/services')) return 'email-templates';
  if (pathname.startsWith('/access-requests')) return 'access-requests';
  if (pathname.startsWith('/audit')) return 'audit';
  return 'dashboard';
};

export type CommandCategory = 'Navigation' | 'Quick Actions' | 'System' | 'Settings';

export interface CommandRouteItem {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  icon: ReactNode;
  keywords: string[];
  route?: string;
  disabled?: boolean;
  roles?: Role[];
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
    id: 'go-monitoring-overview',
    label: 'Monitoring Overview',
    description: 'Open the operator-friendly monitoring snapshot',
    category: 'System',
    icon: <ThunderboltOutlined />,
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-authority',
    label: 'Admin Authority',
    description: 'Manage canonical admin roles and permission overrides',
    category: 'Navigation',
    icon: <KeyOutlined />,
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
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
    icon: <FileTextOutlined />,
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
    icon: <ThunderboltOutlined />,
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
  {
    id: 'go-access-requests',
    label: 'IP Access Requests',
    description: 'Review pending, approved, and rejected IP access requests',
    category: 'System',
    icon: <SafetyCertificateOutlined />,
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
  },
];
