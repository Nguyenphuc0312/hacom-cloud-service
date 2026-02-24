import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ToastProvider, PageSpinner } from "../components/ui";

/**
 * Global layout for app-level providers and lazy-route fallback.
 */
export const RootLayout: React.FC = () => {
  return (
    <>
      <ToastProvider />
      <Suspense fallback={<PageSpinner message="Dang tai trang..." />}>
        <Outlet />
      </Suspense>
    </>
  );
};

export default RootLayout;

