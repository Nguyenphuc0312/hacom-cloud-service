import { lazy } from "react";
import type { AppRouteConfig } from "../types";
import { ROUTE_PATHS } from "../paths";

const LoginPage = lazy(() => import("../../pages/LoginPage"));
const RegisterPage = lazy(() => import("../../pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("../../pages/ForgotPasswordPage"));

/**
 * Guest-only routes. Authenticated users are redirected by GuestRoute.
 */
export const publicRoutes: AppRouteConfig[] = [
  { path: ROUTE_PATHS.LOGIN, component: LoginPage },
  { path: ROUTE_PATHS.REGISTER, component: RegisterPage },
  { path: ROUTE_PATHS.FORGOT_PASSWORD, component: ForgotPasswordPage },
];

