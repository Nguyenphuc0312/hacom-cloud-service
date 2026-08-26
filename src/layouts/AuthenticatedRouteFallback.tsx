import type { FC } from "react";
import { ChatWorkspaceSkeleton, PageSpinner } from "../components/ui";
import { ROUTE_PATHS } from "../router/paths";

export const AuthenticatedRouteFallback: FC<{ pathname: string }> = ({
  pathname,
}) => {
  const isChatRoute =
    pathname === ROUTE_PATHS.CHAT ||
    pathname.startsWith(`${ROUTE_PATHS.CHAT}/`);

  return isChatRoute ? <ChatWorkspaceSkeleton /> : <PageSpinner />;
};
