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
    label: 'Tổng quan',
    description: 'Bảng điều khiển và giám sát',
    icon: <DashboardOutlined />,
  },
  {
    key: 'users',
    label: 'Người dùng',
    description: 'Danh tính và quyền truy cập',
    icon: <TeamOutlined />,
  },
  {
    key: 'conversations',
    label: 'Hội thoại',
    description: 'Luồng xử lý tin nhắn',
    icon: <FileTextOutlined />,
  },
  {
    key: 'system',
    label: 'Hệ thống',
    description: 'Sức khỏe hệ thống và nhật ký',
    icon: <ThunderboltOutlined />,
  },
  {
    key: 'settings',
    label: 'Cấu hình',
    description: 'Thiết lập hạ tầng',
    icon: <FileTextOutlined />,
  },
];

export const navItems: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Bảng điều khiển',
    description: 'Ảnh chụp nhanh hệ thống và các việc cần xử lý tiếp theo.',
    icon: <DashboardOutlined />,
    section: 'analytics',
    route: '/',
  },
  {
    key: 'monitoring-overview',
    label: 'Giám sát',
    description: 'Sức khỏe thời gian thực, lỗi và trạng thái phụ thuộc.',
    icon: <ThunderboltOutlined />,
    section: 'analytics',
    route: '/monitoring',
  },
  {
    key: 'authority',
    label: 'Phân quyền quản trị',
    description: 'Vai trò chuẩn và phần ghi đè quyền quản trị.',
    icon: <KeyOutlined />,
    section: 'users',
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    key: 'users',
    label: 'Người dùng',
    description: 'Tài khoản admin, trạng thái hiện diện và quyền truy cập.',
    icon: <TeamOutlined />,
    section: 'users',
    route: '/users',
  },
  {
    key: 'hr-employees',
    label: 'Danh bạ nhân sự',
    description: 'Hồ sơ nhân viên, import và cấp tài khoản.',
    icon: <SolutionOutlined />,
    section: 'users',
    route: '/hr-employees',
  },
  {
    key: 'conversations',
    label: 'Hội thoại',
    description: 'Danh sách hội thoại và workspace xử lý tin nhắn.',
    icon: <FileTextOutlined />,
    section: 'conversations',
    route: '/conversations',
  },
  {
    key: 'email-templates',
    label: 'Dịch vụ',
    description: 'Sức khỏe dịch vụ, SMTP và mẫu email.',
    icon: <FileTextOutlined />,
    section: 'settings',
    route: '/services/health',
  },
  {
    key: 'access-requests',
    label: 'Truy cập IP',
    description: 'Duyệt yêu cầu IP đang chờ, đã duyệt và đã từ chối.',
    icon: <SafetyCertificateOutlined />,
    section: 'system',
    route: '/access-requests',
  },
  {
    key: 'audit',
    label: 'Nhật ký kiểm toán',
    description: 'Thao tác quản trị, yêu cầu và sự kiện bảo mật.',
    icon: <AuditOutlined />,
    section: 'system',
    route: '/audit',
  },
];

export const breadcrumbNameMap: Record<string, string> = {
  '/': 'Bảng điều khiển',
  '/authority': 'Phân quyền quản trị',
  '/users': 'Người dùng',
  '/hr-employees': 'Danh bạ nhân sự',
  '/conversations': 'Hội thoại',
  '/access-requests': 'Truy cập IP',
  '/audit': 'Nhật ký kiểm toán',
  '/monitoring': 'Giám sát',
  '/services': 'Dịch vụ',
  '/services/smtp': 'SMTP',
  '/services/email-templates': 'Mẫu email',
  '/services/health': 'Sức khỏe dịch vụ',
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
          ? 'Chi tiết người dùng'
          : route.startsWith('/services/')
            ? 'Chi tiết dịch vụ'
            : null),
    }))
    .filter((entry): entry is { route: string; label: string } => Boolean(entry.label));

  return {
    item,
    section,
    title: item?.label ?? 'Bảng điều khiển',
    description: item?.description ?? 'Không gian quan sát và điều khiển vận hành',
    sectionLabel: section?.label ?? 'Tổng quan',
    sectionDescription: section?.description ?? 'Không gian làm việc',
    breadcrumbs,
  };
};

export const pickSelectedMenuKey = (pathname: string): string => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/monitoring')) return 'monitoring-overview';
  if (pathname.startsWith('/authority')) return 'authority';
  if (pathname.startsWith('/users')) return 'users';
  if (pathname.startsWith('/hr-employees')) return 'hr-employees';
  if (pathname.startsWith('/conversations')) return 'conversations';
  if (pathname.startsWith('/services')) return 'email-templates';
  if (pathname.startsWith('/access-requests')) return 'access-requests';
  if (pathname.startsWith('/audit')) return 'audit';
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
    label: 'Bảng điều khiển',
    description: 'Chỉ số tổng quan và ảnh chụp nhanh hệ thống',
    category: 'Điều hướng',
    icon: <DashboardOutlined />,
    keywords: ['home', 'overview', 'dashboard'],
    route: '/',
  },
  {
    id: 'go-monitoring-overview',
    label: 'Tổng quan giám sát',
    description: 'Mở màn hình giám sát tổng quan cho vận hành',
    category: 'Hệ thống',
    icon: <ThunderboltOutlined />,
    keywords: ['monitoring', 'realtime', 'correctness', 'overview'],
    route: '/monitoring',
  },
  {
    id: 'go-authority',
    label: 'Phân quyền quản trị',
    description: 'Quản lý vai trò chuẩn và phần ghi đè quyền',
    category: 'Điều hướng',
    icon: <KeyOutlined />,
    keywords: ['authority', 'admin', 'permissions', 'roles'],
    route: '/authority',
    roles: ['super_admin'],
  },
  {
    id: 'go-users',
    label: 'Người dùng / Tài khoản',
    description: 'Quản lý người dùng quản trị và quyền hạn',
    category: 'Điều hướng',
    icon: <TeamOutlined />,
    keywords: ['users', 'accounts', 'admins'],
    route: '/users',
  },
  {
    id: 'go-hr-employees',
    label: 'Nhân sự',
    description: 'Xem và quản lý hồ sơ nhân viên',
    category: 'Điều hướng',
    icon: <SolutionOutlined />,
    keywords: ['hr', 'employees', 'people'],
    route: '/hr-employees',
  },
  {
    id: 'go-conversations',
    label: 'Hội thoại',
    description: 'Mở workspace chat để xử lý conversation đang mở',
    category: 'Điều hướng',
    icon: <FileTextOutlined />,
    keywords: ['chat', 'conversation', 'messages', 'support'],
    route: '/conversations',
  },
  {
    id: 'go-smtp-settings',
    label: 'Cấu hình SMTP',
    description: 'Thiết lập gửi email và thông tin xác thực',
    category: 'Cấu hình',
    icon: <FileTextOutlined />,
    keywords: ['smtp', 'mail', 'settings'],
    route: '/services/smtp',
  },
  {
    id: 'go-email-templates',
    label: 'Mẫu email',
    description: 'Quản lý các mẫu email hệ thống',
    category: 'Cấu hình',
    icon: <FileTextOutlined />,
    keywords: ['email', 'templates', 'content'],
    route: '/services/email-templates',
  },
  {
    id: 'go-service-health',
    label: 'Sức khỏe dịch vụ / Giám sát',
    description: 'Kiểm tra trạng thái tích hợp và API',
    category: 'Hệ thống',
    icon: <ThunderboltOutlined />,
    keywords: ['health', 'monitoring', 'status', 'services'],
    route: '/services/health',
  },
  {
    id: 'go-logs',
    label: 'Nhật ký kiểm toán',
    description: 'Mở nhật ký kiểm toán và sự kiện bảo mật',
    category: 'Điều hướng',
    icon: <AuditOutlined />,
    keywords: ['logs', 'audit', 'events'],
    route: '/audit',
  },
  {
    id: 'go-access-requests',
    label: 'Yêu cầu truy cập IP',
    description: 'Duyệt các yêu cầu IP đang chờ, đã duyệt và đã từ chối',
    category: 'Hệ thống',
    icon: <SafetyCertificateOutlined />,
    keywords: ['ip', 'access', 'requests', 'approval', 'review'],
    route: '/access-requests',
  },
];
