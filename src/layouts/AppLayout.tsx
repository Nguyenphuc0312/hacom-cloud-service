import React from "react";
import { Outlet } from "react-router-dom";

/**
 * Layout boundary for authenticated app area.
 * Keep it thin; feature-specific chrome lives in page-level containers.
 */
export const AppLayout: React.FC = () => {
  return <Outlet />;
};

export default AppLayout;

