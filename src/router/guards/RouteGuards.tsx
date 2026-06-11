/**
 * Route guards are kept in router layer so route config stays declarative.
 */

import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores";
import { PageSpinner } from "../../components/ui";
import { ForbiddenPage } from "../../pages/errors";
import { ROUTE_PATHS } from "../paths";
import { isBlockedAuthStatus } from "../../features/auth/model/authState";

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
    initialize,
    user,
    authStatus,
    activationContext,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [isInitialized, initialize]);

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
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

  if (authStatus === "bootstrap_error") {
    return (
      <Navigate
        to={ROUTE_PATHS.LOGIN}
        state={{ from: location.pathname }}
        replace
      />
    );
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
    initialize,
    authStatus,
    activationContext,
    user,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [isInitialized, initialize]);

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.default")} />;
  }

  if (isBlockedAuthStatus(authStatus) || authStatus === "bootstrap_error") {
    return <>{children}</>;
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
    initialize,
    isAuthenticated,
    authStatus,
    activationContext,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [isInitialized, initialize]);

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
    initialize,
    user,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [isInitialized, initialize]);

  if (!isInitialized || isBootstrappingAuth) {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (user?.mustChangePassword !== true) {
    return <Navigate to={ROUTE_PATHS.CHAT} replace />;
  }

  return <>{children}</>;
};
