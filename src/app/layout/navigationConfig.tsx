import type { Role } from '@/api/types';
import type { AppIconKey } from '@/components/AppIcon';

export interface NavItem {
  key: string;
  label: string;
  iconKey: AppIconKey;
  section: SidebarSectionKey;
  route: string;
  roles?: Role[];
  children?: NavItem[];
}

export type SidebarSectionKey =
  | 'overview'
  | 'identity'
  | 'chat-system'
  | 'access-control'
  | 'operations';

export interface SidebarSection {
  key: SidebarSectionKey;
  label: string;
  iconKey?: AppIconKey;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { key: 'overview', label: 'Dashboard', iconKey: 'dashboard' },
  { key: 'identity', label: 'Identity', iconKey: 'users' },
  { key: 'chat-system', label: 'Chat System', iconKey: 'messages' },
  { key: 'access-control', label: 'Access Control', iconKey: 'shield' },
  { key: 'operations', label: 'Operations', iconKey: 'settings' },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'System Overview',
    iconKey: 'dashboard',
    section: 'overview',
    route: '/',
  },
  {
    key: 'users',
    label: 'Users',
    iconKey: 'users',
    section: 'identity',
    route: '/users',
  },
  {
    key: 'hr-employees',
    label: 'HR Employees',
    iconKey: 'hr',
    section: 'identity',
    route: '/hr-employees',
  },
  {
    key: 'authority',
    label: 'Roles',
    iconKey: 'shield',
    section: 'identity',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'conversations',
    label: 'Conversations',
    iconKey: 'messages',
    section: 'chat-system',
    route: '/conversations',
  },
  {
    key: 'access-requests',
    label: 'Admin Access',
    iconKey: 'access',
    section: 'access-control',
    route: '/access-requests',
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    iconKey: 'history',
    section: 'access-control',
    route: '/audit',
  },
  {
    key: 'logs',
    label: 'System Logs',
    iconKey: 'fileText',
    section: 'operations',
    route: '/logs',
  },
  {
    key: 'monitoring-overview',
    label: 'Health Check',
    iconKey: 'activity',
    section: 'operations',
    route: '/monitoring',
  },
  {
    key: 'services',
    label: 'Services',
    iconKey: 'server',
    section: 'operations',
    route: '/services/health',
  },
  {
    key: 'settings',
    label: 'Settings',
    iconKey: 'settings',
    section: 'operations',
    route: '/settings',
    children: [
      {
        key: 'settings-smtp',
        label: 'SMTP',
        iconKey: 'mail',
        section: 'operations',
        route: '/settings/smtp',
      },
      {
        key: 'settings-email-templates',
        label: 'Email Templates',
        iconKey: 'fileStack',
        section: 'operations',
        route: '/settings/email-templates',
      },
      {
        key: 'settings-system',
        label: 'System Settings',
        iconKey: 'sliders',
        section: 'operations',
        route: '/settings/system',
      },
    ],
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'System Overview',
  '/authority': 'Roles',
  '/users': 'Users',
  '/hr-employees': 'HR Employees',
  '/access-requests': 'Admin Access',
  '/conversations': 'Conversations',
  '/logs': 'System Logs',
  '/audit': 'Audit Logs',
  '/monitoring': 'Health Check',
  '/services': 'Services',
  '/services/health': 'Services',
  '/settings': 'Settings',
  '/settings/smtp': 'SMTP',
  '/settings/email-templates': 'Email Templates',
  '/settings/system': 'System Settings',
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
  const breadcrumbs = [
    '/',
    ...pathname
      .split('/')
      .filter(Boolean)
      .map((_segment, index, parts) => `/${parts.slice(0, index + 1).join('/')}`),
  ]
    .map((route) => ({
      route,
      label:
        breadcrumbNameMap[route] ??
        (route.startsWith('/users/')
          ? 'User Detail'
          : route.startsWith('/services/')
            ? 'Service Detail'
            : route.startsWith('/settings/')
              ? 'Settings Detail'
              : null),
    }))
    .filter((entry): entry is { route: string; label: string } => Boolean(entry.label));

  return {
    item,
    section,
    title: item?.label ?? 'System Overview',
    sectionLabel: section?.label ?? 'Dashboard',
    breadcrumbs,
  };
};

export const pickSelectedMenuKey = (pathname: string): string => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/access-requests')) return 'access-requests';
  if (pathname.startsWith('/authority')) return 'authority';
  if (pathname.startsWith('/hr-employees')) return 'hr-employees';
  if (pathname.startsWith('/conversations')) return 'conversations';
  if (pathname.startsWith('/logs')) return 'logs';
  if (pathname.startsWith('/audit')) return 'audit';
  if (pathname.startsWith('/monitoring')) return 'monitoring-overview';
  if (pathname.startsWith('/services')) return 'services';
  if (pathname.startsWith('/settings/email-templates')) return 'settings-email-templates';
  if (pathname.startsWith('/settings/system')) return 'settings-system';
  if (pathname.startsWith('/settings/smtp')) return 'settings-smtp';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
};

export type CommandCategory = 'Navigate' | 'Quick Actions' | 'Operations' | 'Settings';

export interface CommandRouteItem {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  iconKey: AppIconKey;
  keywords: string[];
  route?: string;
  disabled?: boolean;
  roles?: Role[];
}

export const commandRouteItems: CommandRouteItem[] = [
  {
    id: 'go-dashboard',
    label: 'System Overview',
    description: 'Monitor users, access control, realtime health, and system activity.',
    category: 'Navigate',
    iconKey: 'dashboard',
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-users',
    label: 'Users',
    description: 'Manage accounts, HR-linked identities, roles, and account status.',
    category: 'Navigate',
    iconKey: 'users',
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-hr-employees',
    label: 'HR Employees',
    description: 'Review employee records synced from HR and linked user accounts.',
    category: 'Navigate',
    iconKey: 'hr',
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-authority',
    label: 'Roles',
    description: 'Review admin roles and permission overrides.',
    category: 'Navigate',
    iconKey: 'shield',
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    id: 'go-access-requests',
    label: 'Admin Access',
    description: 'Review IP approvals, access requests, and admin console access state.',
    category: 'Navigate',
    iconKey: 'access',
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
  },
  {
    id: 'go-conversations',
    label: 'Conversations',
    description: 'Inspect admin-facing conversation records when the backend contract is available.',
    category: 'Navigate',
    iconKey: 'messages',
    keywords: ['chat', 'conversation', 'messages', 'support'],
    route: '/conversations',
  },
  {
    id: 'go-logs',
    label: 'System Logs',
    description: 'Query runtime logs by service, level, and correlation identifiers.',
    category: 'Operations',
    iconKey: 'fileText',
    keywords: ['logs', 'system', 'runtime', 'trace'],
    route: '/logs',
  },
  {
    id: 'go-audit',
    label: 'Audit Logs',
    description: 'Track administrative actions, access decisions, and system events.',
    category: 'Operations',
    iconKey: 'history',
    keywords: ['audit', 'events', 'history'],
    route: '/audit',
  },
  {
    id: 'go-monitoring-overview',
    label: 'Health Check',
    description: 'Monitor telemetry, freshness, and runtime health.',
    category: 'Operations',
    iconKey: 'activity',
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-service-health',
    label: 'Services',
    description: 'Inspect dependency health, latency, version, and running build.',
    category: 'Operations',
    iconKey: 'server',
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-smtp-settings',
    label: 'SMTP',
    description: 'Configure mail transport and verification settings.',
    category: 'Settings',
    iconKey: 'mail',
    keywords: ['smtp', 'mail', 'settings'],
    route: '/settings/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Email Templates',
    description: 'Manage system email template content.',
    category: 'Settings',
    iconKey: 'fileStack',
    keywords: ['email', 'templates', 'content'],
    route: '/settings/email-templates',
  },
  {
    id: 'go-system-settings',
    label: 'System Settings',
    description: 'Review environment, release mode, and operational guardrails.',
    category: 'Settings',
    iconKey: 'sliders',
    keywords: ['settings', 'system', 'environment', 'ops'],
    route: '/settings/system',
  },
];
