import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import {
  ConversationListSkeleton,
  StateBlock,
} from "../../ui";
import { ErrorState } from "../../ui/EmptyState";

interface RoomListLoadingProps {
  count?: number;
}

export const RoomListLoadingState: React.FC<RoomListLoadingProps> = ({
  count = 7,
}) => (
  <div className="min-h-0 flex-1 overflow-y-auto pb-2">
    <ConversationListSkeleton count={count} />
  </div>
);

interface RoomListErrorProps {
  error: string;
  onRetry?: () => void;
}

export const RoomListErrorState: React.FC<RoomListErrorProps> = ({
  error,
  onRetry,
}) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
      <ErrorState
        title={t("error:chat.fetchConversationsFailed")}
        message={error}
        onRetry={onRetry}
      />
    </div>
  );
};

interface RoomListEmptyProps {
  normalizedQuery: string;
}

export const RoomListEmptyState: React.FC<RoomListEmptyProps> = ({
  normalizedQuery,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3">
      <StateBlock
        variant={normalizedQuery ? "search-empty" : "empty"}
        icon={
          normalizedQuery ? (
            <MagnifyingGlassIcon className="h-6 w-6" />
          ) : (
            <ChatBubbleLeftRightIcon className="h-6 w-6" />
          )
        }
        title={
          normalizedQuery
            ? t("sidebar:room.emptyBySearch")
            : t("sidebar:room.empty")
        }
        description={
          normalizedQuery
            ? t("sidebar:search.placeholder")
            : t("chat:empty.noChatDescription")
        }
        className="w-full border-dashed shadow-none"
      />
    </div>
  );
};
