import React from "react";
import { Outlet } from "react-router-dom";

/**
 * Layout boundary for auth pages.
 * Add shared auth shell (logo, side panel, etc.) here when needed.
 */
export const AuthLayout: React.FC = () => {
  return <Outlet />;
};

export default AuthLayout;

