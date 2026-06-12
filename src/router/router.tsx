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
      { path: ROUTE_PATHS.PRIVACY_POLICY, element: <PrivacyPolicyPage /> },
      { path: ROUTE_PATHS.ROOT, element: <Navigate to={ROUTE_PATHS.CHAT} replace /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const appRouter = createBrowserRouter(routeTree, {
  basename: APP_BASE_PATH === "/" ? undefined : APP_BASE_PATH,
});
