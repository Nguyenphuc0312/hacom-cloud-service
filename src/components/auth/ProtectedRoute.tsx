/**
 * Backward-compatible re-export.
 * Route guards now live in src/router/guards to keep routing architecture modular.
 */
export { ProtectedRoute, GuestRoute } from "../../router/guards/RouteGuards";
export { ProtectedRoute as default } from "../../router/guards/RouteGuards";
