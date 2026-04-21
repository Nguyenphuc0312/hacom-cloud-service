import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BadgeCheck,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Eye,
  FileStack,
  FileText,
  History,
  IdCard,
  LayoutDashboard,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  RotateCw,
  Search,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  TriangleAlert,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import clsx from 'clsx';

const icons = {
  activity: Activity,
  access: BadgeCheck,
  bell: Bell,
  chevronDown: ChevronDown,
  chevronsUpDown: ChevronsUpDown,
  copy: Copy,
  dashboard: LayoutDashboard,
  eye: Eye,
  fileStack: FileStack,
  fileText: FileText,
  history: History,
  hr: IdCard,
  lock: Lock,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  messages: MessagesSquare,
  more: MoreHorizontal,
  refresh: RotateCw,
  search: Search,
  server: Server,
  settings: Settings2,
  shield: Shield,
  sliders: SlidersHorizontal,
  unlock: LockOpen,
  user: UserCircle2,
  users: Users,
  warning: TriangleAlert,
  close: X,
} satisfies Record<string, LucideIcon>;

export type AppIconKey = keyof typeof icons;

interface AppIconProps {
  name: AppIconKey;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

export const AppIcon = ({
  name,
  size = 16,
  strokeWidth = 1.9,
  className,
  ...props
}: AppIconProps) => {
  const Icon = icons[name];

  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={clsx('ds-app-icon', className)}
      {...props}
    />
  );
};
