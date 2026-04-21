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
  | 'identity-access'
  | 'operations'
  | 'system'
  | 'configuration';

export interface SidebarSection {
  key: SidebarSectionKey;
  label: string;
  iconKey?: AppIconKey;
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    iconKey: 'dashboard',
  },
  {
    key: 'identity-access',
    label: 'Danh tính và truy cập',
    iconKey: 'users',
  },
  {
    key: 'operations',
    label: 'Vận hành',
    iconKey: 'fileText',
  },
  {
    key: 'system',
    label: 'Hệ thống',
    iconKey: 'activity',
  },
  {
    key: 'configuration',
    label: 'Cấu hình',
    iconKey: 'settings',
  },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    iconKey: 'dashboard',
    section: 'overview',
    route: '/',
  },
  {
    key: 'users',
    label: 'Tài khoản',
    iconKey: 'users',
    section: 'identity-access',
    route: '/users',
  },
  {
    key: 'access-requests',
    label: 'Yêu cầu truy cập',
    iconKey: 'access',
    section: 'identity-access',
    route: '/access-requests',
  },
  {
    key: 'authority',
    label: 'Quyền và vai trò',
    iconKey: 'shield',
    section: 'identity-access',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'hr-employees',
    label: 'Nhân sự',
    iconKey: 'hr',
    section: 'identity-access',
    route: '/hr-employees',
  },
  {
    key: 'conversations',
    label: 'Hội thoại',
    iconKey: 'messages',
    section: 'operations',
    route: '/conversations',
  },
  {
    key: 'logs',
    label: 'Nhật ký hệ thống',
    iconKey: 'fileText',
    section: 'operations',
    route: '/logs',
  },
  {
    key: 'audit',
    label: 'Audit trail',
    iconKey: 'history',
    section: 'operations',
    route: '/audit',
  },
  {
    key: 'monitoring-overview',
    label: 'Giám sát runtime',
    iconKey: 'activity',
    section: 'system',
    route: '/monitoring',
  },
  {
    key: 'services',
    label: 'Trạng thái dịch vụ',
    iconKey: 'server',
    section: 'system',
    route: '/services/health',
  },
  {
    key: 'settings',
    label: 'Thiết lập',
    iconKey: 'settings',
    section: 'configuration',
    route: '/settings',
    children: [
      {
        key: 'settings-smtp',
        label: 'SMTP',
        iconKey: 'mail',
        section: 'configuration',
        route: '/settings/smtp',
      },
      {
        key: 'settings-email-templates',
        label: 'Mẫu email',
        iconKey: 'fileStack',
        section: 'configuration',
        route: '/settings/email-templates',
      },
      {
        key: 'settings-system',
        label: 'Thiết lập hệ thống',
        iconKey: 'sliders',
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
  '/conversations': 'Hội thoại',
  '/logs': 'Nhật ký hệ thống',
  '/audit': 'Audit trail',
  '/monitoring': 'Giám sát runtime',
  '/services': 'Trạng thái dịch vụ',
  '/services/health': 'Sức khỏe dịch vụ',
  '/settings': 'Thiết lập',
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
  iconKey: AppIconKey;
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
    iconKey: 'dashboard',
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-users',
    label: 'Tài khoản',
    description: 'Tra cứu tài khoản admin và trạng thái truy cập',
    category: 'Điều hướng',
    iconKey: 'users',
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-access-requests',
    label: 'Yêu cầu truy cập',
    description: 'Duyệt các yêu cầu IP và quyền truy cập',
    category: 'Điều hướng',
    iconKey: 'access',
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
  },
  {
    id: 'go-authority',
    label: 'Quyền và vai trò',
    description: 'Quản trị vai trò chuẩn và phạm vi truy cập',
    category: 'Điều hướng',
    iconKey: 'shield',
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    id: 'go-hr-employees',
    label: 'Nhân sự',
    description: 'Đối chiếu hồ sơ nhân sự và cấp tài khoản',
    category: 'Điều hướng',
    iconKey: 'hr',
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-conversations',
    label: 'Hội thoại',
    description: 'Đọc lịch sử chat, kiểm tra user context và xử lý moderation',
    category: 'Điều hướng',
    iconKey: 'messages',
    keywords: ['chat', 'conversation', 'messages', 'support'],
    route: '/conversations',
  },
  {
    id: 'go-logs',
    label: 'Nhật ký hệ thống',
    description: 'Tra cứu log runtime theo service, level và correlation',
    category: 'Điều hướng',
    iconKey: 'fileText',
    keywords: ['logs', 'system', 'runtime', 'trace'],
    route: '/logs',
  },
  {
    id: 'go-audit',
    label: 'Audit trail',
    description: 'Theo dõi actor, action, target và thay đổi quản trị',
    category: 'Điều hướng',
    iconKey: 'history',
    keywords: ['audit', 'events', 'history'],
    route: '/audit',
  },
  {
    id: 'go-monitoring-overview',
    label: 'Giám sát runtime',
    description: 'Theo dõi telemetry, freshness và tình trạng runtime',
    category: 'Hệ thống',
    iconKey: 'activity',
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-service-health',
    label: 'Trạng thái dịch vụ',
    description: 'Kiểm tra trạng thái phụ thuộc, độ trễ và build đang chạy',
    category: 'Hệ thống',
    iconKey: 'server',
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-smtp-settings',
    label: 'Cấu hình SMTP',
    description: 'Thiết lập gửi mail và xác thực',
    category: 'Cấu hình',
    iconKey: 'mail',
    keywords: ['smtp', 'mail', 'settings'],
    route: '/settings/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Mẫu email',
    description: 'Quản lý nội dung email hệ thống',
    category: 'Cấu hình',
    iconKey: 'fileStack',
    keywords: ['email', 'templates', 'content'],
    route: '/settings/email-templates',
  },
  {
    id: 'go-system-settings',
    label: 'Thiết lập hệ thống',
    description: 'Xem môi trường, chế độ cập nhật và guardrail vận hành',
    category: 'Cấu hình',
    iconKey: 'sliders',
    keywords: ['settings', 'system', 'environment', 'ops'],
    route: '/settings/system',
  },
];
