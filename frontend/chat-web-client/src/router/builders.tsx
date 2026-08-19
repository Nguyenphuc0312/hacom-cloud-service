import React from "react";
import type { ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import { publicRoutes } from "./config/publicRoutes";
import { privateRoutes } from "./config/privateRoutes";
import type { AppRouteConfig } from "./types";
import {
  ActivationRoute,
  ForceChangePasswordRoute,
  GuestRoute,
  PendingHrLinkRoute,
  ProtectedRoute,
} from "./guards/RouteGuards";

const renderRouteElement = (
  Component: React.ComponentType,
  options?: {
    guestOnly?: boolean;
    activationOnly?: boolean;
    forceChangePasswordOnly?: boolean;
    pendingHrLinkOnly?: boolean;
    roles?: string[];
  },
): ReactElement => {
  const page = <Component />;

  if (options?.activationOnly) {
    return <ActivationRoute>{page}</ActivationRoute>;
  }

  if (options?.forceChangePasswordOnly) {
    return <ForceChangePasswordRoute>{page}</ForceChangePasswordRoute>;
  }

  if (options?.pendingHrLinkOnly) {
    return <PendingHrLinkRoute>{page}</PendingHrLinkRoute>;
  }

  if (options?.guestOnly) {
    return <GuestRoute>{page}</GuestRoute>;
  }

  if (options?.roles?.length) {
    return <ProtectedRoute allowedRoles={options.roles}>{page}</ProtectedRoute>;
  }

  return page;
};

const buildRouteObject = ({
  path,
  index,
  component,
  guestOnly = true,
  activationOnly = false,
  forceChangePasswordOnly = false,
  pendingHrLinkOnly = false,
}: AppRouteConfig): RouteObject => ({
  path,
  index,
  element: renderRouteElement(component as React.ComponentType, {
    guestOnly: forceChangePasswordOnly || pendingHrLinkOnly ? false : guestOnly,
    activationOnly,
    forceChangePasswordOnly,
    pendingHrLinkOnly,
  }),
});

export const buildSplitPublicRouteObjects = (): RouteObject[] =>
  publicRoutes.filter((r) => r.splitLayout).map(buildRouteObject);

export const buildNonSplitPublicRouteObjects = (): RouteObject[] =>
  publicRoutes.filter((r) => !r.splitLayout).map(buildRouteObject);

export const buildPrivateRouteObjects = (): RouteObject[] =>
  privateRoutes.map(({ path, index, component, element, roles }) => ({
    path,
    index,
    element: element ?? renderRouteElement(component as React.ComponentType, {
      roles,
    }),
  }));
