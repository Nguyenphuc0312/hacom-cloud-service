import { createBrowserRouter, Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { RootLayout } from "../layouts/RootLayout";
import { AuthLayout } from "../layouts/AuthLayout";
import { AppLayout } from "../layouts/AppLayout";
import { ProtectedRoute } from "./guards/RouteGuards";
import { buildPrivateRouteObjects, buildPublicRouteObjects } from "./builders";
import { ROUTE_PATHS } from "./paths";

const routeTree: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <AuthLayout />,
        children: buildPublicRouteObjects(),
      },
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: buildPrivateRouteObjects(),
      },
      { path: ROUTE_PATHS.ROOT, element: <Navigate to={ROUTE_PATHS.CHAT} replace /> },
      { path: "*", element: <Navigate to={ROUTE_PATHS.CHAT} replace /> },
    ],
  },
];

export const appRouter = createBrowserRouter(routeTree);
