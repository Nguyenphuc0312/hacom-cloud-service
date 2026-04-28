import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Copy,
  Eye,
  FileStack,
  FileText,
  History,
  IdCard,
  Inbox,
  LayoutDashboard,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Menu,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import clsx from 'clsx';

const icons = {
  activity: Activity,
  access: BadgeCheck,
  arrowDown: ArrowDown,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  bell: Bell,
  check: Check,
  chevronDown: ChevronDown,
  chevronsUpDown: ChevronsUpDown,
  copy: Copy,
  dashboard: LayoutDashboard,
  eye: Eye,
  fileStack: FileStack,
  fileText: FileText,
  history: History,
  hr: IdCard,
  inbox: Inbox,
  lock: Lock,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  messages: MessagesSquare,
  minus: Minus,
  more: MoreHorizontal,
  plus: Plus,
  refresh: RotateCw,
  search: Search,
  server: Server,
  settings: Settings2,
  shield: Shield,
  sliders: SlidersHorizontal,
  unlock: LockOpen,
  upload: Upload,
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
