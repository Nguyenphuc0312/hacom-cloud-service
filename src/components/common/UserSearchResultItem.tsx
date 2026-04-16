import React from "react";
import clsx from "clsx";

import type { User as UserType } from "../../types";
import { Avatar } from "./Avatar";

interface UserSearchResultItemProps {
  avatarUrl?: string | null;
  avatarAlt: string;
  status?: UserType["status"] | null;
  primaryText: string;
  secondaryText?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  trailing?: React.ReactNode;
}

export const UserSearchResultItem: React.FC<UserSearchResultItemProps> = ({
  avatarUrl,
  avatarAlt,
  status,
  primaryText,
  secondaryText,
  selected = false,
  disabled = false,
  onSelect,
  trailing,
}) => {
  return (
    <div
      className={clsx(
        "flex min-h-[72px] items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
        selected
          ? "border-primary/30 bg-primary/10"
          : "border-transparent bg-transparent hover:border-border hover:bg-surface-overlay",
        disabled && "opacity-60",
      )}
      data-selected={selected ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled || !onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Avatar
          src={avatarUrl}
          alt={avatarAlt}
          size="md"
          status={status ?? undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {primaryText}
          </p>
          {secondaryText ? (
            <p className="truncate text-xs text-text-muted">{secondaryText}</p>
          ) : null}
        </div>
      </button>

      {trailing ? (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
};

export default UserSearchResultItem;
