/**
 * Build-time rollout switches for the browser's in-app attachment viewer.
 *
 * Vite replaces these values while producing the bundle. Only the exact
 * literal "true" enables either behavior so a missing, malformed, or runtime
 * container value fails closed.
 */
export const isInAppFileViewerEnabled = (): boolean =>
  import.meta.env.VITE_FILE_VIEWER_ENABLED === "true";

export const isFileLifecycleTelemetryEnabled = (): boolean =>
  import.meta.env.VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED === "true";
