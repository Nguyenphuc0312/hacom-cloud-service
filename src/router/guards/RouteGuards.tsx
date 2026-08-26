/**
 * Route guards are kept in router layer so route config stays declarative.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores";
import { ErrorState, PageSpinner } from "../../components/ui";
import { ForbiddenPage } from "../../pages/errors";
import { ROUTE_PATHS } from "../paths";
import {
  isBlockedAuthStatus,
  isPendingHrLinkStatus,
} from "../../features/auth/model/authState";
import { AuthenticatedRouteFallback } from "../../layouts/AuthenticatedRouteFallback";

interface GuardProps {
  children: React.ReactNode;
}

interface ProtectedRouteProps extends GuardProps {
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    isAuthenticated,
    isInitialized,
    isBootstrappingAuth,
    user,
    authStatus,
    activationContext,
    error,
    initialize,
  } = useAuthStore();

  if (!isInitialized || isBootstrappingAuth) {
    return (
      <AuthenticatedRouteFallback
        pathname={location.pathname}
        includeNavigationRail
        label={t("common:loading.checkingAuth")}
      />
    );
  }

  if (authStatus === "activation_required" && activationContext) {
    return (
      <Navigate
        to={ROUTE_PATHS.ACTIVATION}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (isBlockedAuthStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (
    isPendingHrLinkStatus(authStatus) &&
    location.pathname !== ROUTE_PATHS.PENDING_HR_LINK
  ) {
    return <Navigate to={ROUTE_PATHS.PENDING_HR_LINK} replace />;
  }

  if (authStatus === "bootstrap_error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--color-chat-canvas))] px-6">
        <ErrorState
          title={t("error:auth.profileMissing")}
          message={error ?? t("error:auth.profileRetryHint")}
          onRetry={() => void initialize()}
        />
      </div>
    );
  }

  if (authStatus === "password_change_required") {
    return <Navigate to={ROUTE_PATHS.FORCE_CHANGE_PASSWORD} replace />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTE_PATHS.LOGIN}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (
    user?.mustChangePassword === true &&
    location.pathname !== ROUTE_PATHS.FORCE_CHANGE_PASSWORD
  ) {
    return <Navigate to={ROUTE_PATHS.FORCE_CHANGE_PASSWORD} replace />;
  }

  if (allowedRoles?.length) {
    const userRole = user?.role;
    const isAllowed = !!userRole && allowedRoles.includes(userRole);

    if (!isAllowed) {
      return <ForbiddenPage />;
    }
  }

  return <>{children}</>;
};

export const GuestRoute: React.FC<GuardProps> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    isAuthenticated,
    isInitialized,
    isBootstrappingAuth,
    authStatus,
    activationContext,
    user,
  } = useAuthStore();

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.default")} />;
  }

  if (isBlockedAuthStatus(authStatus) || authStatus === "bootstrap_error") {
    return <>{children}</>;
  }

  if (isPendingHrLinkStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.PENDING_HR_LINK} replace />;
  }

  if (isAuthenticated || authStatus === "authenticated") {
    if (user?.mustChangePassword === true) {
      return <Navigate to={ROUTE_PATHS.FORCE_CHANGE_PASSWORD} replace />;
    }
    const from = (location.state as { from?: string } | null)?.from ?? ROUTE_PATHS.CHAT;
    return <Navigate to={from} replace />;
  }

  if (
    authStatus === "activation_required" &&
    activationContext &&
    location.pathname !== ROUTE_PATHS.ACTIVATION
  ) {
    const activationFrom = (location.state as { from?: string } | null)?.from;
    return (
      <Navigate
        to={ROUTE_PATHS.ACTIVATION}
        replace
        state={activationFrom ? { from: activationFrom } : undefined}
      />
    );
  }

  return <>{children}</>;
};

export const ActivationRoute: React.FC<GuardProps> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    isInitialized,
    isBootstrappingAuth,
    isAuthenticated,
    authStatus,
    activationContext,
  } = useAuthStore();

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
  }

  if (isAuthenticated || authStatus === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from ?? ROUTE_PATHS.CHAT;
    return <Navigate to={from} replace />;
  }

  if (isBlockedAuthStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (isPendingHrLinkStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.PENDING_HR_LINK} replace />;
  }

  if (authStatus === "bootstrap_error") {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (authStatus === "activation_required" && activationContext) {
    return <>{children}</>;
  }

  return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
};

export const ForceChangePasswordRoute: React.FC<GuardProps> = ({ children }) => {
  const { t } = useTranslation();
  const {
    isAuthenticated,
    isInitialized,
    isBootstrappingAuth,
    user,
    authStatus,
    passwordChangeContinuation,
  } = useAuthStore();

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
  }

  if (!isAuthenticated && !(authStatus === "password_change_required" && passwordChangeContinuation)) {
    if (isPendingHrLinkStatus(authStatus)) {
      return <Navigate to={ROUTE_PATHS.PENDING_HR_LINK} replace />;
    }
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (authStatus !== "password_change_required" && user?.mustChangePassword !== true) {
    return <Navigate to={ROUTE_PATHS.CHAT} replace />;
  }

  return <>{children}</>;
};

export const PendingHrLinkRoute: React.FC<GuardProps> = ({ children }) => {
  const { t } = useTranslation();
  const {
    isInitialized,
    isBootstrappingAuth,
    authStatus,
    user,
  } = useAuthStore();

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
  }

  if (isPendingHrLinkStatus(authStatus) && user) {
    return <>{children}</>;
  }

  if (isBlockedAuthStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (authStatus === "authenticated") {
    return <Navigate to={ROUTE_PATHS.CHAT} replace />;
  }

  return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
};
