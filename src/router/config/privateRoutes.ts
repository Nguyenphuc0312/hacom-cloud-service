import { lazy } from "react";
import type { AppRouteConfig } from "../types";
import { ROUTE_PATHS } from "../paths";

const ChatPage = lazy(() => import("../../pages/ChatPage"));

/**
 * Authenticated routes. Optional `roles` enables role-based access control.
 */
export const privateRoutes: AppRouteConfig[] = [
  { path: ROUTE_PATHS.CHAT_DETAIL, component: ChatPage },
  // Example for future admin route:
  // { path: "/admin", component: AdminDashboardPage, roles: ["admin"] },
];

