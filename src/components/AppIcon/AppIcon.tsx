import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
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
  Globe,
  Grid3X3,
  HeartPulse,
  History,
  IdCard,
  Inbox,
  Info,
  LayoutDashboard,
  List,
  Monitor,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Menu,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCw,
  Search,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  Smartphone,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Upload,
  UserCircle2,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import clsx from 'clsx';

const icons = {
  activity: Activity,
  access: BadgeCheck,
  alert: AlertTriangle,
  alertCircle: AlertCircle,
  archive: Archive,
  arrowDown: ArrowDown,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  bell: Bell,
  check: Check,
  chevronDown: ChevronDown,
  chevronsUpDown: ChevronsUpDown,
  clock: Activity, // Using Activity as clock
  copy: Copy,
  dashboard: LayoutDashboard,
  eye: Eye,
  fileStack: FileStack,
  fileText: FileText,
  globe: Globe,
  grid: Grid3X3,
  health: HeartPulse,
  history: History,
  hr: IdCard,
  inbox: Inbox,
  info: Info,
  list: List,
  monitor: Monitor,
  lock: Lock,
  logout: LogOut,
  mail: Mail,
  menu: Menu,
  messages: MessagesSquare,
  minus: Minus,
  more: MoreHorizontal,
  pause: Pause,
  play: Play,
  plus: Plus,
  refresh: RotateCw,
  search: Search,
  server: Server,
  settings: Settings2,
  shield: Shield,
  sliders: SlidersHorizontal,
  smartphone: Smartphone,
  trending: TrendingUp,
  trendingDown: TrendingDown,
  trendingUp: TrendingUp,
  unlock: LockOpen,
  upload: Upload,
  user: UserCircle2,
  users: Users,
  warning: TriangleAlert,
  wifi: Wifi,
  wifiOff: WifiOff,
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

  if (!Icon) {
    console.warn(`AppIcon: icon "${name}" not found, using fallback`);
    return <Activity size={size} strokeWidth={strokeWidth} className={clsx('ds-app-icon', className)} {...props} />;
  }

  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={clsx('ds-app-icon', className)}
      {...props}
    />
  );
};
