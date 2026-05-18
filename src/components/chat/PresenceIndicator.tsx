/**
 * @fileoverview PresenceIndicator — online dot + last seen text
 * Usage:
 *   <PresenceIndicator userId="abc123" showLastSeen />
 */

import React from "react";
import {
  usePresenceStore,
  type PresenceState,
} from "../../stores/presenceStore";

interface PresenceIndicatorProps {
  userId: string;
  /** Show green dot indicator (default true) */
  showDot?: boolean;
  /** Show "last seen X ago" text (default false) */
  showLastSeen?: boolean;
  /** Size of the dot in pixels (default 10) */
  size?: number;
  /** Additional CSS class */
  className?: string;
}

const stateColors: Record<PresenceState, string> = {
  online: "bg-green-500",
  away: "bg-yellow-500",
  idle: "bg-yellow-400",
  dnd: "bg-red-500",
  busy: "bg-red-400",
  offline: "bg-[hsl(var(--color-text-muted))]",
};

function formatLastSeen(isoString?: string): string {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  userId,
  showDot = true,
  showLastSeen = false,
  size = 10,
  className = "",
}) => {
  const presence = usePresenceStore((s) => s.presenceMap[userId]);

  const state: PresenceState = presence?.state ?? "offline";
  const isOffline = state === "offline";
  const lastSeenText =
    showLastSeen && isOffline ? formatLastSeen(presence?.lastSeenAt) : "";

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {showDot && (
        <span
          className={`inline-block rounded-full ${stateColors[state]} ${
            state === "online" ? "animate-pulse" : ""
          }`}
          style={{ width: size, height: size }}
          title={state}
          aria-label={`Status: ${state}`}
        />
      )}
      {lastSeenText && (
        <span className="text-xs text-text-muted">
          {lastSeenText}
        </span>
      )}
    </span>
  );
};

export default PresenceIndicator;
