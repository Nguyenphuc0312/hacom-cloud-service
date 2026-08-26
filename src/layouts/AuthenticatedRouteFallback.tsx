import type { FC, ReactNode } from "react";
import {
  AppRouteSkeleton,
  AuthPageSkeleton,
  ChatWorkspaceSkeleton,
  SettingsSkeleton,
  type AppRouteSkeletonVariant,
} from "../components/ui";
import { ROUTE_PATHS } from "../router/paths";
import { PersistentNavigationRail } from "../shared/layout";

interface AuthenticatedRouteFallbackProps {
  pathname: string;
  includeNavigationRail?: boolean;
  label?: string;
}

const matchesRoute = (pathname: string, route: string): boolean =>
  pathname === route || pathname.startsWith(`${route}/`);

const authRoutes = [
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.ACTIVATION,
  ROUTE_PATHS.VERIFY_EMAIL,
  ROUTE_PATHS.FORGOT_PASSWORD,
  ROUTE_PATHS.RESET_PASSWORD,
  ROUTE_PATHS.FORCE_CHANGE_PASSWORD,
  ROUTE_PATHS.PENDING_HR_LINK,
];

const legalRoutes = [
  ROUTE_PATHS.PRIVACY_POLICY,
  ROUTE_PATHS.DATA_DELETION,
  ROUTE_PATHS.SUPPORT,
  ROUTE_PATHS.TERMS,
];

const resolveAppSkeleton = (pathname: string): ReactNode => {
  if (
    pathname === ROUTE_PATHS.ROOT ||
    matchesRoute(pathname, ROUTE_PATHS.CHAT) ||
    pathname === ROUTE_PATHS.CLOUD
  ) {
    return <ChatWorkspaceSkeleton />;
  }

  if (
    matchesRoute(pathname, ROUTE_PATHS.SETTINGS) ||
    matchesRoute(pathname, ROUTE_PATHS.CLOUD_MANAGE)
  ) {
    return <SettingsSkeleton />;
  }

  let variant: AppRouteSkeletonVariant = "list";

  if (matchesRoute(pathname, ROUTE_PATHS.CALENDAR)) {
    variant = "calendar";
  } else if (
    matchesRoute(pathname, ROUTE_PATHS.AI_ASSISTANT) ||
    matchesRoute(pathname, ROUTE_PATHS.WORK_REPORT_DRAFTS)
  ) {
    variant = "workspace";
  } else if (
    matchesRoute(pathname, ROUTE_PATHS.TASKS) ||
    matchesRoute(pathname, ROUTE_PATHS.TIMESHEET) ||
    matchesRoute(pathname, ROUTE_PATHS.LEAVE) ||
    matchesRoute(pathname, ROUTE_PATHS.ARCHIVE)
  ) {
    variant = "table";
  } else if (
    matchesRoute(pathname, ROUTE_PATHS.MAINTENANCE) ||
    matchesRoute(pathname, ROUTE_PATHS.HELP) ||
    matchesRoute(pathname, ROUTE_PATHS.FAQ) ||
    matchesRoute(pathname, ROUTE_PATHS.TIPS) ||
    matchesRoute(pathname, ROUTE_PATHS.REPORT_ISSUE)
  ) {
    variant = "content";
  }

  return <AppRouteSkeleton variant={variant} />;
};

export const AuthenticatedRouteFallback: FC<
  AuthenticatedRouteFallbackProps
> = ({ pathname, includeNavigationRail = false, label }) => {
  if (authRoutes.some((route) => matchesRoute(pathname, route))) {
    return <AuthPageSkeleton />;
  }

  if (legalRoutes.some((route) => matchesRoute(pathname, route))) {
    return <AppRouteSkeleton variant="content" />;
  }

  const skeleton = resolveAppSkeleton(pathname);

  if (!includeNavigationRail) {
    return skeleton;
  }

  return (
    <div
      className="private-app-shell"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className="private-app-viewport">
        <PersistentNavigationRail />
        <div className="private-app-route">{skeleton}</div>
      </div>
    </div>
  );
};
