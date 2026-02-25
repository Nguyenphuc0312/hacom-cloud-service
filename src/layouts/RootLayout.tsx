import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { ToastProvider, PageSpinner } from "../components/ui";

/**
 * Global layout for app-level providers and lazy-route fallback.
 */
export const RootLayout: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <ToastProvider />
      <Suspense fallback={<PageSpinner message={t("common:loading.page")} />}>
        <Outlet />
      </Suspense>
    </>
  );
};

export default RootLayout;
