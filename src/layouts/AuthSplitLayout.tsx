import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { AuthLayoutSplit } from "../components/auth/AuthLayoutSplit";
import { AuthFormSkeleton } from "../components/ui";

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
