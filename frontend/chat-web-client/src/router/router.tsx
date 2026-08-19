import { lazy } from "react";
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
// Static legal/support pages — lazy so they stay out of the initial bundle
// (~180 kB combined, rarely visited). Suspense is provided by RootLayout.
const PrivacyPolicyPage = lazy(() =>
  import("../pages/PrivacyPolicyPage").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const DataDeletionPage = lazy(() =>
  import("../pages/DataDeletionPage").then((m) => ({ default: m.DataDeletionPage })),
);
const SupportPage = lazy(() =>
  import("../pages/SupportPage").then((m) => ({ default: m.SupportPage })),
);
const TermsPage = lazy(() =>
  import("../pages/TermsPage").then((m) => ({ default: m.TermsPage })),
);
// ---------------------------------------------------------------------------
// POC — Phase 2A audio recording evaluation (TEMPORARY, remove after eval).
// Lazy so this eval-only route doesn't weigh the initial bundle (~26 kB).
// ---------------------------------------------------------------------------
const AudioRecorderPocPage = lazy(() =>
  import("../poc/audio").then((m) => ({ default: m.AudioRecorderPocPage })),
);

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
