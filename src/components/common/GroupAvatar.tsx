import React from "react";
import clsx from "clsx";
import { UserGroupIcon } from "@heroicons/react/24/solid";
import type { Conversation, UserSummary } from "../../types";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getRepresentativeGroupParticipants,
  getUserDisplayName,
} from "../../utils/messageHelpers";

interface GroupAvatarProps {
  conversation: Conversation;
  currentUserId: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  alt?: string;
}

const sizeClasses = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

const tileTextClasses = {
  xs: "text-[8px]",
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-[11px]",
  xl: "text-xs",
};

const iconClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

const tilePalette = [
  "bg-primary text-text-inverse",
  "bg-secondary text-text-primary",
  "bg-accent/80 text-text-primary",
  "bg-surface-hover text-text-primary",
];

const getInitials = (participant: UserSummary): string => {
  const source =
    getUserDisplayName(participant, { allowTechnicalFallback: true }) ||
    participant.id;

  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
};

const getTilePaletteClass = (participant: UserSummary): string => {
  const entropySource = participant.id || participant.username || participant.displayName || "group";
  const hash = Array.from(entropySource).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return tilePalette[hash % tilePalette.length];
};

const GroupAvatarTile: React.FC<{
  participant?: UserSummary;
  size: NonNullable<GroupAvatarProps["size"]>;
}> = ({ participant, size }) => {
  if (!participant) {
    return (
      <div
        className="bg-surface-hover/80"
        aria-hidden="true"
        data-group-avatar-tile="empty"
      />
    );
  }

  if (participant.avatar) {
    return (
      <div className="h-full w-full" data-group-avatar-tile="photo">
        <img
          src={participant.avatar}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex h-full w-full items-center justify-center font-semibold uppercase tracking-[0.03em]",
        tileTextClasses[size],
        getTilePaletteClass(participant),
      )}
      aria-hidden="true"
      data-group-avatar-tile="initials"
    >
      {getInitials(participant)}
    </div>
  );
};

export const GroupAvatar: React.FC<GroupAvatarProps> = ({
  conversation,
  currentUserId,
  size = "md",
  className,
  alt,
}) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const label =
    alt ||
    getConversationDisplayName(conversation, currentUserId) ||
    "Group conversation";
  const explicitAvatar = getConversationAvatar(conversation, currentUserId);
  const representatives = getRepresentativeGroupParticipants(
    conversation,
    currentUserId,
    4,
  );

  React.useEffect(() => {
    setImageFailed(false);
  }, [explicitAvatar]);

  if (explicitAvatar && !imageFailed) {
    return (
      <div
        className={clsx("relative inline-block shrink-0", className)}
        role="img"
        aria-label={label}
        data-group-avatar-variant="photo"
      >
        <img
          src={explicitAvatar}
          alt=""
          className={clsx(
            sizeClasses[size],
            "rounded-full object-cover ring-2 ring-surface",
          )}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (representatives.length > 0) {
    const slots = Array.from({ length: 4 }, (_, index) => representatives[index]);

    return (
      <div
        className={clsx("relative inline-block shrink-0", className)}
        role="img"
        aria-label={label}
        data-group-avatar-variant="mosaic"
      >
        <div
          className={clsx(
            sizeClasses[size],
            "grid grid-cols-2 overflow-hidden rounded-full ring-2 ring-surface",
          )}
        >
          {slots.map((participant, index) => (
            <GroupAvatarTile
              key={participant?.id || `empty-${index}`}
              participant={participant}
              size={size}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx("relative inline-block shrink-0", className)}
      role="img"
      aria-label={label}
      data-group-avatar-variant="icon"
    >
      <div
        className={clsx(
          sizeClasses[size],
          "flex items-center justify-center rounded-full bg-surface-hover text-text-secondary ring-2 ring-surface",
        )}
      >
        <UserGroupIcon className={iconClasses[size]} aria-hidden="true" />
      </div>
    </div>
  );
};

export default GroupAvatar;
