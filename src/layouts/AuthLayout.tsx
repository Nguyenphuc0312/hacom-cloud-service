import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { AuthPageSkeleton } from "../components/ui";

export const AuthLayout: React.FC = () => {
  return (
    <Suspense fallback={<AuthPageSkeleton variant="card" />}>
      <Outlet />
    </Suspense>
  );
};

export default AuthLayout;
