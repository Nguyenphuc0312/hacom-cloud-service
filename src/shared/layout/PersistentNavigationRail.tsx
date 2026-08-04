import React from "react";
import { SideRail } from "./SideRail";
import type { UserSummary } from "../../types";

interface PersistentNavigationRailProps {
  currentUser?: Pick<UserSummary, "displayName" | "username" | "avatar"> | null;
  onCurrentUserClick?: () => void;
}

export const PersistentNavigationRail: React.FC<
  PersistentNavigationRailProps
> = ({ currentUser, onCurrentUserClick }) => {
  return (
    <SideRail
      currentUser={currentUser}
      onCurrentUserClick={onCurrentUserClick}
    />
  );
};

export default PersistentNavigationRail;
