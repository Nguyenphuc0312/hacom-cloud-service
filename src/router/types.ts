import type { ReactElement } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

export interface AppRouteConfig {
  path?: string;
  index?: boolean;
  component?: LazyExoticComponent<ComponentType> | ComponentType;
  element?: ReactElement;
  roles?: string[];
  guestOnly?: boolean;
  activationOnly?: boolean;
  forceChangePasswordOnly?: boolean;
  splitLayout?: boolean;
}
