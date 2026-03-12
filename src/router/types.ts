import type { ComponentType, LazyExoticComponent } from "react";

export interface AppRouteConfig {
  path?: string;
  index?: boolean;
  component: LazyExoticComponent<ComponentType> | ComponentType;
  roles?: string[];
  guestOnly?: boolean;
}
