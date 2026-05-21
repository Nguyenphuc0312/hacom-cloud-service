import { lazy } from "react";
import type { AppRouteConfig } from "../types";
import { ROUTE_PATHS } from "../paths";

const ChatPage = lazy(() => import("../../pages/ChatPage"));
const SettingsPage = lazy(() => import("../../pages/SettingsPage"));
const FriendsPage = lazy(() => import("../../pages/FriendsPage"));
const JoinByLinkPage = lazy(() => import("../../pages/JoinByLinkPage"));
const NotificationsPage = lazy(() => import("../../pages/NotificationsPage"));
const MaintenancePage = lazy(() => import("../../pages/errors/MaintenancePage"));
const TasksPage = lazy(() => import("../../features/tasks/pages/TasksPage"));
const HelpPage = lazy(() => import("../../pages/HelpPage"));
const FAQPage = lazy(() => import("../../pages/FAQPage"));
const ReportIssuePage = lazy(() => import("../../pages/ReportIssuePage"));
const CalendarPage = lazy(() => import("../../features/calendar/pages/CalendarPage"));
const AiAssistantPage = lazy(() => import("../../features/ai-assistant/pages/AiAssistantPage"));
const ArchiveToAiRedirect = lazy(() => import("../../pages/errors/ArchiveToAiRedirect"));

/**
 * Authenticated routes. Optional `roles` enables role-based access control.
 */
export const privateRoutes: AppRouteConfig[] = [
  { path: ROUTE_PATHS.CHAT_DETAIL, component: ChatPage },
  { path: ROUTE_PATHS.FRIENDS, component: FriendsPage },
  { path: ROUTE_PATHS.FRIEND_DISCOVERY, component: FriendsPage },
  { path: ROUTE_PATHS.JOIN_BY_TOKEN, component: JoinByLinkPage },
  { path: ROUTE_PATHS.SETTINGS, component: SettingsPage },
  { path: ROUTE_PATHS.MAINTENANCE, component: MaintenancePage },
  { path: ROUTE_PATHS.TASKS, component: TasksPage },
  { path: ROUTE_PATHS.CALENDAR, component: CalendarPage },
  { path: ROUTE_PATHS.AI_ASSISTANT, component: AiAssistantPage },
  { path: ROUTE_PATHS.ARCHIVE, component: ArchiveToAiRedirect },
  { path: ROUTE_PATHS.NOTIFICATIONS, component: NotificationsPage },
  { path: ROUTE_PATHS.HELP, component: HelpPage },
  { path: ROUTE_PATHS.FAQ, component: FAQPage },
  { path: ROUTE_PATHS.REPORT_ISSUE, component: ReportIssuePage },
  // Example for future admin route:
  // { path: "/admin", component: AdminDashboardPage, roles: ["admin"] },
];
