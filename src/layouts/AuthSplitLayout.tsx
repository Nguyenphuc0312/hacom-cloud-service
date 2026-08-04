import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { AuthLayoutSplit } from "../components/auth/AuthLayoutSplit";

const AuthFormSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-5 py-2">
    <div className="flex justify-center">
      <div className="h-14 w-28 rounded-xl bg-surface-overlay" />
    </div>
    <div className="space-y-2">
      <div className="h-6 w-2/3 rounded-md bg-surface-overlay" />
      <div className="h-4 w-1/2 rounded-md bg-surface-overlay" />
    </div>
    <div className="h-10 w-full rounded-xl bg-surface-overlay" />
    <div className="space-y-3">
      <div className="h-11 w-full rounded-xl bg-surface-overlay" />
      <div className="h-11 w-full rounded-xl bg-surface-overlay" />
      <div className="h-12 w-full rounded-xl bg-surface-overlay" />
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
