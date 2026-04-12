/**
 * Route guards are kept in router layer so route config stays declarative.
 */

import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores";
import { PageSpinner } from "../../components/ui";
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

  if (!isInitialized || authStatus === "loading") {
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

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTE_PATHS.LOGIN}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (allowedRoles?.length) {
    const userRole = user?.role;
    const isAllowed = !!userRole && allowedRoles.includes(userRole);

    if (!isAllowed) {
      return <Navigate to={ROUTE_PATHS.CHAT} replace />;
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
    initialize,
    authStatus,
    activationContext,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [isInitialized, initialize]);

  if (!isInitialized || authStatus === "loading") {
    return <PageSpinner message={t("common:loading.default")} />;
  }

  if (isAuthenticated || authStatus === "authenticated") {
    return <Navigate to={ROUTE_PATHS.CHAT} replace />;
  }

  if (
    authStatus === "activation_required" &&
    activationContext &&
    location.pathname !== ROUTE_PATHS.ACTIVATION
  ) {
    return <Navigate to={ROUTE_PATHS.ACTIVATION} replace />;
  }

  return <>{children}</>;
};

export const ActivationRoute: React.FC<GuardProps> = ({ children }) => {
  const { t } = useTranslation();
  const {
    isInitialized,
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

  if (!isInitialized || authStatus === "loading") {
    return <PageSpinner message={t("common:loading.checkingAuth")} />;
  }

  if (isAuthenticated || authStatus === "authenticated") {
    return <Navigate to={ROUTE_PATHS.CHAT} replace />;
  }

  if (isBlockedAuthStatus(authStatus)) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (authStatus === "activation_required" && activationContext) {
    return <>{children}</>;
  }

  return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
};
