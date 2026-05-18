import React from "react";
import { Navigate } from "react-router-dom";
import { ROUTE_PATHS } from "../../router/paths";

/** Redirects /archive to /ai-assistant */
export const ArchiveToAiRedirect: React.FC = () => (
  <Navigate to={ROUTE_PATHS.AI_ASSISTANT} replace />
);

export default ArchiveToAiRedirect;
