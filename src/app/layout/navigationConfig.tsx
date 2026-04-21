import {
  AuditOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import type { Role } from '@/api/types';

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  section: SidebarSectionKey;
  route: string;
  badge?: ReactNode;
  roles?: Role[];
  children?: NavItem[];
}

export type SidebarSectionKey =
  | 'overview'
  | 'identity-access'
  | 'operations'
  | 'system'
  | 'configuration';

export interface SidebarSection {
  key: SidebarSectionKey;
  label: string;
  icon?: ReactNode;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    icon: <DashboardOutlined />,
  },
  {
    key: 'identity-access',
    label: 'Danh tính và truy cập',
    icon: <TeamOutlined />,
  },
  {
    key: 'operations',
    label: 'Vận hành',
    icon: <DatabaseOutlined />,
  },
  {
    key: 'system',
    label: 'Hệ thống',
    icon: <ThunderboltOutlined />,
  },
  {
    key: 'configuration',
    label: 'Cấu hình',
    icon: <SettingOutlined />,
  },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardOutlined />,
    section: 'overview',
    route: '/',
  },
  {
    key: 'users',
    label: 'Tài khoản',
    icon: <TeamOutlined />,
    section: 'identity-access',
    route: '/users',
  },
  {
    key: 'access-requests',
    label: 'Yêu cầu truy cập',
    icon: <SafetyCertificateOutlined />,
    section: 'identity-access',
    route: '/access-requests',
  },
  {
    key: 'authority',
    label: 'Quyền và vai trò',
    icon: <KeyOutlined />,
    section: 'identity-access',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'hr-employees',
    label: 'Nhân sự',
    icon: <SolutionOutlined />,
    section: 'identity-access',
    route: '/hr-employees',
  },
  {
    key: 'conversations',
    label: 'Tra cứu hội thoại',
    icon: <FileTextOutlined />,
    section: 'operations',
    route: '/conversations',
  },
  {
    key: 'logs',
    label: 'System logs',
    icon: <DatabaseOutlined />,
    section: 'operations',
    route: '/logs',
  },
  {
    key: 'audit',
    label: 'Audit trail',
    icon: <AuditOutlined />,
    section: 'operations',
    route: '/audit',
  },
  {
    key: 'monitoring-overview',
    label: 'Giám sát runtime',
    icon: <ThunderboltOutlined />,
    section: 'system',
    route: '/monitoring',
  },
  {
    key: 'services',
    label: 'Trạng thái dịch vụ',
    icon: <DatabaseOutlined />,
    section: 'system',
    route: '/services/health',
  },
  {
    key: 'settings',
    label: 'System settings',
    icon: <SettingOutlined />,
    section: 'configuration',
    route: '/settings',
    children: [
      {
        key: 'settings-smtp',
        label: 'SMTP',
        icon: <FileTextOutlined />,
        section: 'configuration',
        route: '/settings/smtp',
      },
      {
        key: 'settings-email-templates',
        label: 'Mẫu email',
        icon: <FileTextOutlined />,
        section: 'configuration',
        route: '/settings/email-templates',
      },
      {
        key: 'settings-system',
        label: 'Thiết lập hệ thống',
        icon: <SettingOutlined />,
        section: 'configuration',
        route: '/settings/system',
      },
    ],
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Dashboard',
  '/authority': 'Quyền và vai trò',
  '/users': 'Tài khoản',
  '/hr-employees': 'Nhân sự',
  '/access-requests': 'Yêu cầu truy cập',
  '/conversations': 'Tra cứu hội thoại',
  '/logs': 'System logs',
  '/audit': 'Audit trail',
  '/monitoring': 'Giám sát runtime',
  '/services': 'Trạng thái dịch vụ',
  '/services/health': 'Sức khỏe dịch vụ',
  '/settings': 'System settings',
  '/settings/smtp': 'SMTP',
  '/settings/email-templates': 'Mẫu email',
  '/settings/system': 'Thiết lập hệ thống',
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
          ? 'Chi tiết tài khoản'
          : route.startsWith('/services/')
            ? 'Chi tiết dịch vụ'
            : route.startsWith('/settings/')
              ? 'Chi tiết cấu hình'
              : null),
    }))
    .filter((entry): entry is { route: string; label: string } => Boolean(entry.label));

  return {
    item,
    section,
    title: item?.label ?? 'Dashboard',
    sectionLabel: section?.label ?? 'Tổng quan',
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

export type CommandCategory = 'Điều hướng' | 'Tác vụ nhanh' | 'Hệ thống' | 'Cấu hình';

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
    description: 'Tình trạng hệ thống và hạng mục cần xử lý',
    category: 'Điều hướng',
    icon: <DashboardOutlined />,
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-users',
    label: 'Tài khoản',
    description: 'Tra cứu tài khoản admin và trạng thái truy cập',
    category: 'Điều hướng',
    icon: <TeamOutlined />,
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-access-requests',
    label: 'Yêu cầu truy cập',
    description: 'Duyệt các yêu cầu IP và quyền truy cập',
    category: 'Điều hướng',
    icon: <SafetyCertificateOutlined />,
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
  },
  {
    id: 'go-authority',
    label: 'Quyền và vai trò',
    description: 'Quản trị vai trò chuẩn và phạm vi truy cập',
    category: 'Điều hướng',
    icon: <KeyOutlined />,
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    id: 'go-hr-employees',
    label: 'Nhân sự',
    description: 'Đối chiếu hồ sơ nhân sự và cấp tài khoản',
    category: 'Điều hướng',
    icon: <SolutionOutlined />,
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-conversations',
    label: 'Tra cứu hội thoại',
    description: 'Đọc lịch sử chat, kiểm tra user context và xử lý moderation',
    category: 'Điều hướng',
    icon: <FileTextOutlined />,
    keywords: ['chat', 'conversation', 'messages', 'support'],
    route: '/conversations',
  },
  {
    id: 'go-logs',
    label: 'System logs',
    description: 'Tra cứu log runtime theo service, level và correlation',
    category: 'Điều hướng',
    icon: <DatabaseOutlined />,
    keywords: ['logs', 'system', 'runtime', 'trace'],
    route: '/logs',
  },
  {
    id: 'go-audit',
    label: 'Audit trail',
    description: 'Theo dõi actor, action, target và thay đổi quản trị',
    category: 'Điều hướng',
    icon: <AuditOutlined />,
    keywords: ['audit', 'events', 'history'],
    route: '/audit',
  },
  {
    id: 'go-monitoring-overview',
    label: 'Giám sát runtime',
    description: 'Theo dõi telemetry, freshness và tình trạng runtime',
    category: 'Hệ thống',
    icon: <ThunderboltOutlined />,
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-service-health',
    label: 'Trạng thái dịch vụ',
    description: 'Kiểm tra trạng thái phụ thuộc, độ trễ và build đang chạy',
    category: 'Hệ thống',
    icon: <DatabaseOutlined />,
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-smtp-settings',
    label: 'Cấu hình SMTP',
    description: 'Thiết lập gửi mail và xác thực',
    category: 'Cấu hình',
    icon: <FileTextOutlined />,
    keywords: ['smtp', 'mail', 'settings'],
    route: '/settings/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Mẫu email',
    description: 'Quản lý nội dung email hệ thống',
    category: 'Cấu hình',
    icon: <FileTextOutlined />,
    keywords: ['email', 'templates', 'content'],
    route: '/settings/email-templates',
  },
  {
    id: 'go-system-settings',
    label: 'Thiết lập hệ thống',
    description: 'Xem môi trường, chế độ cập nhật và guardrail vận hành',
    category: 'Cấu hình',
    icon: <SettingOutlined />,
    keywords: ['settings', 'system', 'environment', 'ops'],
    route: '/settings/system',
  },
];
