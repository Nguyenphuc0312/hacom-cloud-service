import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";

export const AuthLayout: React.FC = () => {
  return (
    <Suspense fallback={<div className="flex h-[var(--app-dvh)] w-full bg-white" />}>
      <Outlet />
    </Suspense>
  );
};

export default AuthLayout;

