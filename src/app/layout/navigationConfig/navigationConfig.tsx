import type { Role } from '@/api/types/auth/auth';
import type { AppIconKey } from '@/components/AppIcon/AppIcon';

// Feature flag: IP approval feature is enabled
const isIpApprovalEnabled = import.meta.env.VITE_ADMIN_IP_APPROVAL_ENABLED !== 'false';

export interface NavItem {
  key: string;
  label: string;
  iconKey: AppIconKey;
  section: SidebarSectionKey;
  route: string;
  roles?: Role[];
  disabled?: boolean;
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
  { key: 'overview', label: 'Tổng quan', iconKey: 'dashboard' },
  { key: 'identity', label: 'Danh tính', iconKey: 'users' },
  { key: 'chat-system', label: 'Hệ thống chat', iconKey: 'messages' },
  { key: 'access-control', label: 'Kiểm soát truy cập', iconKey: 'shield' },
  { key: 'operations', label: 'Vận hành', iconKey: 'settings' },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Tổng quan hệ thống',
    iconKey: 'dashboard',
    section: 'overview',
    route: '/',
  },
  {
    key: 'users',
    label: 'Người dùng',
    iconKey: 'users',
    section: 'identity',
    route: '/users',
  },
  {
    key: 'hr-employees',
    label: 'Nhân sự HR',
    iconKey: 'hr',
    section: 'identity',
    route: '/hr-employees',
  },
  {
    key: 'authority',
    label: 'Vai trò',
    iconKey: 'shield',
    section: 'identity',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'conversations',
    label: 'Hội thoại',
    iconKey: 'messages',
    section: 'chat-system',
    route: '/conversations',
  },
  {
    key: 'access-requests',
    label: 'Truy cập admin',
    iconKey: 'access',
    section: 'access-control',
    route: '/access-requests',
    disabled: !isIpApprovalEnabled,
  },
  {
    key: 'audit',
    label: 'Nhật ký audit',
    iconKey: 'history',
    section: 'access-control',
    route: '/audit',
  },
  {
    key: 'logs',
    label: 'Nhật ký hệ thống',
    iconKey: 'fileText',
    section: 'operations',
    route: '/logs',
  },
  {
    key: 'monitoring-overview',
    label: 'Kiểm tra sức khỏe',
    iconKey: 'activity',
    section: 'operations',
    route: '/monitoring',
  },
  {
    key: 'services',
    label: 'Dịch vụ',
    iconKey: 'server',
    section: 'operations',
    route: '/services/health',
  },
  {
    key: 'settings',
    label: 'Cài đặt',
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
        label: 'Mẫu email',
        iconKey: 'fileStack',
        section: 'operations',
        route: '/settings/email-templates',
      },
      {
        key: 'settings-system',
        label: 'Cài đặt hệ thống',
        iconKey: 'sliders',
        section: 'operations',
        route: '/settings/system',
      },
    ],
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Tổng quan hệ thống',
  '/authority': 'Vai trò',
  '/users': 'Người dùng',
  '/hr-employees': 'Nhân sự HR',
  '/access-requests': 'Truy cập admin',
  '/conversations': 'Hội thoại',
  '/logs': 'Nhật ký hệ thống',
  '/audit': 'Nhật ký audit',
  '/monitoring': 'Kiểm tra sức khỏe',
  '/services': 'Dịch vụ',
  '/services/health': 'Dịch vụ',
  '/settings': 'Cài đặt',
  '/settings/smtp': 'SMTP',
  '/settings/email-templates': 'Mẫu email',
  '/settings/system': 'Cài đặt hệ thống',
  '/profile': 'Hồ sơ cá nhân',
};

const flattenNavItems = (items: NavItem[]): NavItem[] =>
  items.flatMap((item) => [item, ...(item.children ? flattenNavItems(item.children) : [])]);

export const resolveNavigationContext = (pathname: string) => {
  if (pathname.startsWith('/profile')) {
    return {
      item: null,
      section: null,
      title: 'Hồ sơ cá nhân',
      sectionLabel: 'Tài khoản',
      breadcrumbs: [
        { route: '/', label: 'Tổng quan hệ thống' },
        { route: '/profile', label: 'Hồ sơ cá nhân' },
      ],
    };
  }

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
          ? 'Chi tiết người dùng'
          : route.startsWith('/services/')
            ? 'Chi tiết dịch vụ'
            : route.startsWith('/settings/')
              ? 'Chi tiết cài đặt'
              : null),
    }))
    .filter((entry): entry is { route: string; label: string } => Boolean(entry.label));

  return {
    item,
    section,
    title: item?.label ?? 'Tổng quan hệ thống',
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
  if (pathname.startsWith('/profile')) return 'profile';
  return 'dashboard';
};

export type CommandCategory = 'Điều hướng' | 'Thao tác nhanh' | 'Vận hành' | 'Cài đặt';

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
    label: 'Tổng quan hệ thống',
    description: 'Theo dõi người dùng, truy cập, realtime và hoạt động hệ thống.',
    category: 'Điều hướng',
    iconKey: 'dashboard',
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-users',
    label: 'Người dùng',
    description: 'Quản lý tài khoản, danh tính HR, vai trò và trạng thái.',
    category: 'Điều hướng',
    iconKey: 'users',
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-hr-employees',
    label: 'Nhân sự HR',
    description: 'Rà soát hồ sơ nhân sự đồng bộ từ HR và tài khoản liên kết.',
    category: 'Điều hướng',
    iconKey: 'hr',
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-authority',
    label: 'Vai trò',
    description: 'Rà soát vai trò admin và quyền được ghi đè.',
    category: 'Điều hướng',
    iconKey: 'shield',
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    id: 'go-access-requests',
    label: 'Truy cập admin',
    description: 'Duyệt IP, yêu cầu truy cập và trạng thái vào console admin.',
    category: 'Điều hướng',
    iconKey: 'access',
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
    disabled: !isIpApprovalEnabled,
  },
  {
    id: 'go-conversations',
    label: 'Hội thoại',
    description: 'Kiểm tra bản ghi hội thoại phục vụ vận hành admin.',
    category: 'Điều hướng',
    iconKey: 'messages',
    keywords: ['chat', 'conversation', 'messages', 'support'],
    route: '/conversations',
  },
  {
    id: 'go-logs',
    label: 'Nhật ký hệ thống',
    description: 'Tra cứu log runtime theo dịch vụ, cấp độ và mã đối chiếu.',
    category: 'Vận hành',
    iconKey: 'fileText',
    keywords: ['logs', 'system', 'runtime', 'trace'],
    route: '/logs',
  },
  {
    id: 'go-audit',
    label: 'Nhật ký audit',
    description: 'Theo dõi thao tác quản trị, quyết định truy cập và sự kiện hệ thống.',
    category: 'Vận hành',
    iconKey: 'history',
    keywords: ['audit', 'events', 'history'],
    route: '/audit',
  },
  {
    id: 'go-monitoring-overview',
    label: 'Kiểm tra sức khỏe',
    description: 'Theo dõi telemetry, độ mới dữ liệu và sức khỏe runtime.',
    category: 'Vận hành',
    iconKey: 'activity',
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-service-health',
    label: 'Dịch vụ',
    description: 'Kiểm tra sức khỏe phụ thuộc, độ trễ, phiên bản và build đang chạy.',
    category: 'Vận hành',
    iconKey: 'server',
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-smtp-settings',
    label: 'SMTP',
    description: 'Cấu hình vận chuyển mail và xác minh.',
    category: 'Cài đặt',
    iconKey: 'mail',
    keywords: ['smtp', 'mail', 'settings'],
    route: '/settings/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Mẫu email',
    description: 'Quản lý nội dung mẫu email hệ thống.',
    category: 'Cài đặt',
    iconKey: 'fileStack',
    keywords: ['email', 'templates', 'content'],
    route: '/settings/email-templates',
  },
  {
    id: 'go-system-settings',
    label: 'Cài đặt hệ thống',
    description: 'Rà soát môi trường, chế độ release và guardrail vận hành.',
    category: 'Cài đặt',
    iconKey: 'sliders',
    keywords: ['settings', 'system', 'environment', 'ops'],
    route: '/settings/system',
  },
];
