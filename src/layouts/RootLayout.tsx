import React, { Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import { AppErrorBoundary } from "../components/error";
import { SettingsApplier } from "../components/settings";
import { scheduleChunkReloadFlagReset } from "../utils/chunkReload";
import { registerSoftNavigator } from "../lib/softNavigator";
import { AuthenticatedRouteFallback } from "./AuthenticatedRouteFallback";

/**
 * Global layout for app-level providers and lazy-route fallback.
 */
export const RootLayout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    registerSoftNavigator((path, options) => {
      navigate(path, { replace: options?.replace ?? true });
    });
  }, [navigate]);

  useEffect(() => {
    // The app shell mounted on the current build → allow a future (unrelated)
    // chunk failure to trigger its own one-shot reload. If we'd instead crashed
    // at mount, the error boundary runs first and the loop guard stays set.
    scheduleChunkReloadFlagReset();
  }, []);

  return (
    <>
      <ToastProvider />
      <SettingsApplier />
      <Suspense
        fallback={
          <AuthenticatedRouteFallback
            pathname={location.pathname}
            includeNavigationRail
            label={t("common:loading.page")}
          />
        }
      >
        <AppErrorBoundary>
          <Outlet />
        </AppErrorBoundary>
      </Suspense>
    </>
  );
};

export default RootLayout;
