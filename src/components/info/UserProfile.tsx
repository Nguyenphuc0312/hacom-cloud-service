import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  UserIcon,
  BellIcon,
  PhotoIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import type { UserSummary } from "../../types";
import { UserStatus } from "../../types";

interface UserProfileProps {
  user: UserSummary;
  onClose: () => void;
  className?: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onClose,
  className,
}) => {
  const { t } = useTranslation(["profile", "common"]);

  const statusText =
    user.status === UserStatus.ONLINE
      ? t("common:status.online")
      : t("common:status.offline");

  return (
    <div className={clsx("flex flex-col h-full bg-surface", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-text-primary">
          {t("profile:userProfile.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-surface-overlay transition-colors"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center py-6 px-4">
          <Avatar
            src={user.avatar}
            alt={user.displayName || user.username}
            size="xl"
            status={user.status}
            showStatus
          />

          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold text-text-primary">
                {user.displayName || user.username}
              </h2>
            </div>

            <p className="text-sm text-text-muted mt-1">@{user.username}</p>

            <p
              className={clsx(
                "text-sm mt-1",
                user.status === UserStatus.ONLINE
                  ? "text-chat-online"
                  : "text-text-muted",
              )}
            >
              {statusText}
            </p>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <UserIcon className="w-5 h-5 text-text-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">@{user.username}</p>
              <p className="text-xs text-text-muted">
                {t("profile:userProfile.usernameLabel")}
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-text-muted" />
              <span className="text-sm text-text-primary">
                {t("profile:userProfile.notifications")}
              </span>
            </div>
            <div className="w-10 h-6 bg-primary rounded-full relative">
              <div className="absolute right-1 top-1 w-4 h-4 bg-surface rounded-full shadow" />
            </div>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <PhotoIcon className="w-5 h-5 text-text-muted" />
            <span className="text-sm text-text-primary">
              {t("profile:userProfile.media")}
            </span>
            <span className="ml-auto text-sm text-text-muted">24</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <MagnifyingGlassIcon className="w-5 h-5 text-text-muted" />
            <span className="text-sm text-text-primary">
              {t("profile:userProfile.searchInConversation")}
            </span>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <NoSymbolIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">
              {t("profile:userProfile.blockUser")}
            </span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <ExclamationTriangleIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">
              {t("profile:userProfile.report")}
            </span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <TrashIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">
              {t("profile:userProfile.deleteConversation")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
