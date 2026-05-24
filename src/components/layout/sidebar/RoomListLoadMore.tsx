import React from "react";
import { useTranslation } from "react-i18next";
import { SkeletonButton } from "../../ui";

interface RoomListLoadMoreProps {
  isLoadingMore: boolean;
}

export const RoomListLoadMore: React.FC<RoomListLoadMoreProps> = ({
  isLoadingMore,
}) => {
  const { t } = useTranslation();
  return (
    <div className="px-4 pb-2 pt-2">
      {isLoadingMore ? (
        <div
          className="flex h-9 items-center justify-center rounded-full border border-dashed border-border/60 bg-surface/80"
          aria-busy="true"
        >
          <SkeletonButton width="64%" height={14} className="max-w-44" />
        </div>
      ) : (
        <div className="flex h-9 items-center justify-center rounded-full border border-dashed border-border/60 text-xs text-text-muted">
          {t("sidebar:actions.loadMore", {
            defaultValue: "Loading more...",
          })}
        </div>
      )}
    </div>
  );
};
