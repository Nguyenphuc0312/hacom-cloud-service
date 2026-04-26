/**
 * @fileoverview Blocked users settings section.
 */

import React, { useEffect } from "react";
import clsx from "clsx";
import { NoSymbolIcon, UserMinusIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { SettingsFieldGroup } from "./SettingsFieldGroup";
import { SettingsSection } from "./SettingsSection";
import { Avatar } from "../common/Avatar";
import { Button, DirectorySkeleton, toast } from "../ui";
import { useFriendship } from "../../hooks/useFriendship";

interface BlockedUsersSectionProps {
  id?: string;
}

export const BlockedUsersSection: React.FC<BlockedUsersSectionProps> = ({
  id,
}) => {
  const { t } = useTranslation("settings");
  const {
    blockedUsers,
    fetchBlockedUsers,
    isBlockedLoading: isLoading,
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
      id={id}
      title={t("blockedUsers.title")}
      description={t("blockedUsers.description")}
    >
      <SettingsFieldGroup>
        {isLoading ? (
          <DirectorySkeleton count={3} />
        ) : blockedUsers.length === 0 ? (
          <div className="py-6 text-center">
            <NoSymbolIcon className="mx-auto h-8 w-8 text-text-muted/50" />
            <p className="mt-2 text-sm text-text-muted">
              {t("blockedUsers.empty")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {blockedUsers.map((user) => {
              const displayName =
                [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                user.username;

              return (
                <li
                  key={user.id}
                  className={clsx(
                    "flex items-center gap-3 py-3",
                    "first:pt-1 last:pb-1",
                  )}
                >
                  <Avatar
                    src={user.avatar}
                    alt={displayName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      @{user.username}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnblock(user.id, displayName)}
                  >
                    <UserMinusIcon className="mr-1 h-4 w-4" />
                    {t("blockedUsers.unblock")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsFieldGroup>
    </SettingsSection>
  );
};

export default BlockedUsersSection;
