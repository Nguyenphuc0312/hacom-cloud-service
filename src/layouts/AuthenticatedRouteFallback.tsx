import type { FC } from "react";
import { ChatWorkspaceSkeleton, PageSpinner } from "../components/ui";
import { ROUTE_PATHS } from "../router/paths";
import { PersistentNavigationRail } from "../shared/layout";

interface AuthenticatedRouteFallbackProps {
  pathname: string;
  includeNavigationRail?: boolean;
  label?: string;
}

export const AuthenticatedRouteFallback: FC<
  AuthenticatedRouteFallbackProps
> = ({ pathname, includeNavigationRail = false, label }) => {
  const isChatRoute =
    pathname === ROUTE_PATHS.CHAT ||
    pathname.startsWith(`${ROUTE_PATHS.CHAT}/`);

  if (!isChatRoute) {
    return <PageSpinner message={label} />;
  }

  if (!includeNavigationRail) {
    return <ChatWorkspaceSkeleton />;
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
        <div className="private-app-route">
          <ChatWorkspaceSkeleton />
        </div>
      </div>
    </div>
  );
};
