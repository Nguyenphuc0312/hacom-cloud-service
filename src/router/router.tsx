import { createBrowserRouter, Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { RootLayout } from "../layouts/RootLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { AuthSplitLayout } from "../layouts/AuthSplitLayout";
import { AppLayout } from "../layouts/AppLayout";
import { ProtectedRoute } from "./guards/RouteGuards";
import { buildPrivateRouteObjects, buildSplitPublicRouteObjects, buildNonSplitPublicRouteObjects } from "./builders";
import { ROUTE_PATHS } from "./paths";
import { RouterErrorBoundary } from "../components/common/RouterErrorBoundary";
import { NotFoundPage } from "../pages/errors";
import { APP_BASE_PATH } from "../config";
import { PrivacyPolicyPage } from "../pages/PrivacyPolicyPage";
import { DataDeletionPage } from "../pages/DataDeletionPage";
import { SupportPage } from "../pages/SupportPage";
import { TermsPage } from "../pages/TermsPage";
// ---------------------------------------------------------------------------
// POC — Phase 2A audio recording evaluation (TEMPORARY, remove after eval)
// ---------------------------------------------------------------------------
import { AudioRecorderPocPage } from "../poc/audio";

const routeTree: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouterErrorBoundary />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            element: <AuthSplitLayout />,
            children: buildSplitPublicRouteObjects(),
          },
          ...buildNonSplitPublicRouteObjects(),
        ],
      },
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: buildPrivateRouteObjects(),
      },
      // POC — Phase 2A (remove after evaluation)
      { path: "/poc/audio", element: <AudioRecorderPocPage /> },
      { path: ROUTE_PATHS.PRIVACY_POLICY, element: <PrivacyPolicyPage /> },
      { path: ROUTE_PATHS.DATA_DELETION, element: <DataDeletionPage /> },
      { path: ROUTE_PATHS.SUPPORT, element: <SupportPage /> },
      { path: ROUTE_PATHS.TERMS, element: <TermsPage /> },
      { path: ROUTE_PATHS.ROOT, element: <Navigate to={ROUTE_PATHS.CHAT} replace /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const appRouter = createBrowserRouter(routeTree, {
  basename: APP_BASE_PATH === "/" ? undefined : APP_BASE_PATH,
});
