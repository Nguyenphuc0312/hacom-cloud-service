import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { AuthLayoutSplit } from "../components/auth/AuthLayoutSplit";
import { Skeleton } from "../components/ui";

const AuthFormSkeleton: React.FC = () => (
  <div className="skeleton-stage space-y-5 py-2" aria-busy="true">
    <div className="flex justify-center">
      <Skeleton className="h-14 w-28" rounded="lg" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-6 w-2/3" rounded="md" />
      <Skeleton className="h-4 w-1/2" rounded="sm" />
    </div>
    <Skeleton className="h-10 w-full" rounded="lg" />
    <div className="space-y-3">
      <Skeleton className="h-11 w-full" rounded="lg" />
      <Skeleton className="h-11 w-full" rounded="lg" />
      <Skeleton className="h-12 w-full" rounded="lg" />
    </div>
  </div>
);

export const AuthSplitLayout: React.FC = () => {
  const location = useLocation();

  return (
    <AuthLayoutSplit>
      <Suspense fallback={<AuthFormSkeleton />}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </Suspense>
    </AuthLayoutSplit>
  );
};

export default AuthSplitLayout;
