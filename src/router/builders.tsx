import React from "react";
import type { ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import { publicRoutes } from "./config/publicRoutes";
import { privateRoutes } from "./config/privateRoutes";
import { GuestRoute, ProtectedRoute } from "./guards/RouteGuards";

const renderRouteElement = (
  Component: React.ComponentType,
  options?: { guestOnly?: boolean; roles?: string[] },
): ReactElement => {
  const page = <Component />;

  if (options?.guestOnly) {
    return <GuestRoute>{page}</GuestRoute>;
  }

  if (options?.roles?.length) {
    return <ProtectedRoute allowedRoles={options.roles}>{page}</ProtectedRoute>;
  }

  return page;
};

export const buildPublicRouteObjects = (): RouteObject[] =>
  publicRoutes.map(({ path, index, component, guestOnly = true }) => ({
    path,
    index,
    element: renderRouteElement(component as React.ComponentType, {
      guestOnly,
    }),
  }));

export const buildPrivateRouteObjects = (): RouteObject[] =>
  privateRoutes.map(({ path, index, component, roles }) => ({
    path,
    index,
    element: renderRouteElement(component as React.ComponentType, {
      roles,
    }),
  }));
