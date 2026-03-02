/**
 * @fileoverview Blocked Users Section
 *
 * Lists blocked users with unblock action.
 * Uses useFriendship hook for data + optimistic UI.
 */

import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { NoSymbolIcon, UserMinusIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { Spinner, Button, toast } from "../ui";
import { Avatar } from "../common/Avatar";
import { useFriendship } from "../../hooks/useFriendship";

export const BlockedUsersSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const {
    blockedUsers,
    isBlockedLoading: isLoading,
    fetchBlockedUsers,
    unblockUser,
  } = useFriendship();

  useEffect(() => {
    fetchBlockedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnblock = async (userId: string, username: string) => {
    try {
      await unblockUser(userId);
      toast.success(t("blockedUsers.unblockSuccess", { name: username }));
    } catch {
      toast.error(t("blockedUsers.unblockFailed"));
    }
  };

  return (
    <SettingsSection
      icon={<NoSymbolIcon className="h-5 w-5" />}
      title={t("blockedUsers.title")}
      description={t("blockedUsers.description")}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="py-6 text-center">
          <NoSymbolIcon className="mx-auto h-8 w-8 text-text-muted/50" />
          <p className="mt-2 text-sm text-text-muted">
            {t("blockedUsers.empty")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {blockedUsers.map((user) => (
            <li
              key={user.id}
              className={clsx(
                "flex items-center gap-3 py-3",
                "first:pt-1 last:pb-1",
              )}
            >
              <Avatar
                src={user.avatar}
                alt={
                  [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                  user.username
                }
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                    user.username}
                </p>
                <p className="truncate text-xs text-text-muted">
                  @{user.username}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleUnblock(
                    user.id,
                    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                      user.username,
                  )
                }
              >
                <UserMinusIcon className="mr-1 h-4 w-4" />
                {t("blockedUsers.unblock")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
};

export default BlockedUsersSection;
