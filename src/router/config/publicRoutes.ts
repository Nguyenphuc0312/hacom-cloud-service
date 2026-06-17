import { lazy } from "react";
import type { AppRouteConfig } from "../types";
import { ROUTE_PATHS } from "../paths";
import { LoginPage } from "../../pages/LoginPage";

const ActivationFlowPage = lazy(
  () => import("../../features/activation/pages/ActivationFlowPage"),
);
const VerifyEmailPage = lazy(() => import("../../pages/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("../../pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("../../pages/ResetPasswordPage"));
const ForceChangePasswordPage = lazy(
  () => import("../../pages/ForceChangePasswordPage"),
);
const PendingHrLinkPage = lazy(() => import("../../pages/PendingHrLinkPage"));

/**
 * Public routes. Most are guest-only, but verification links must stay accessible
 * for both authenticated and unauthenticated users.
 */
export const publicRoutes: AppRouteConfig[] = [
  { path: ROUTE_PATHS.LOGIN, component: LoginPage, guestOnly: true, splitLayout: true },
  {
    path: ROUTE_PATHS.ACTIVATION,
    component: ActivationFlowPage,
    guestOnly: false,
    activationOnly: true,
  },
  {
    path: ROUTE_PATHS.VERIFY_EMAIL,
    component: VerifyEmailPage,
    guestOnly: false,
  },
  {
    path: ROUTE_PATHS.FORGOT_PASSWORD,
    component: ForgotPasswordPage,
    guestOnly: true,
    splitLayout: true,
  },
  {
    path: ROUTE_PATHS.RESET_PASSWORD,
    component: ResetPasswordPage,
    guestOnly: true,
  },
  {
    path: ROUTE_PATHS.FORCE_CHANGE_PASSWORD,
    component: ForceChangePasswordPage,
    guestOnly: false,
    forceChangePasswordOnly: true,
    splitLayout: true,
  },
  {
    path: ROUTE_PATHS.PENDING_HR_LINK,
    component: PendingHrLinkPage,
    guestOnly: false,
    pendingHrLinkOnly: true,
    splitLayout: true,
  },
];
