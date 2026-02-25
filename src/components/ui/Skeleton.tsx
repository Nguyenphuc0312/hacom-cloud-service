/**
 * @fileoverview Skeleton loading components
 * Skeleton placeholders cho loading states
 */

import React from "react";
import clsx from "clsx";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "none" | "sm" | "md" | "lg" | "full";
}

const roundedClasses = {
  none: "rounded-none",
  sm: "rounded",
  md: "rounded-lg",
  lg: "rounded-xl",
  full: "rounded-full",
};

/**
 * Base skeleton component
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  width,
  height,
  rounded = "md",
}) => {
  return (
    <div
      className={clsx(
        "bg-surface-active animate-pulse",
        roundedClasses[rounded],
        className,
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
};

/**
 * Skeleton cho conversation item trong sidebar
 */
export const ConversationSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Avatar */}
      <Skeleton className="w-12 h-12 flex-shrink-0" rounded="full" />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Name */}
        <Skeleton className="h-4 w-3/4" />
        {/* Message preview */}
        <Skeleton className="h-3 w-full" />
      </div>

      {/* Time */}
      <Skeleton className="w-10 h-3 flex-shrink-0" />
    </div>
  );
};

/**
 * Skeleton list cho conversations
 */
export const ConversationListSkeleton: React.FC<{ count?: number }> = ({
  count = 6,
}) => {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <ConversationSkeleton key={i} />
      ))}
    </div>
  );
};

/**
 * Skeleton cho message bubble
 */
export const MessageSkeleton: React.FC<{ isMe?: boolean; width?: number }> = ({
  isMe = false,
  width = 50,
}) => {
  return (
    <div
      className={clsx(
        "flex gap-2 px-4 py-1",
        isMe ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar (only for others) */}
      {!isMe && <Skeleton className="w-8 h-8 flex-shrink-0" rounded="full" />}

      {/* Bubble */}
      <div
        className="h-10 rounded-lg bg-surface-active animate-pulse"
        style={{ width: `${width}%` }}
      />
    </div>
  );
};

/**
 * Skeleton list cho messages
 */
export const MessageListSkeleton: React.FC<{ count?: number }> = ({
  count = 8,
}) => {
  // Pre-calculate widths and isMe values
  const items = [
    { isMe: false, width: 45 },
    { isMe: true, width: 55 },
    { isMe: false, width: 35 },
    { isMe: false, width: 60 },
    { isMe: true, width: 40 },
    { isMe: false, width: 50 },
    { isMe: true, width: 65 },
    { isMe: false, width: 45 },
  ];

  return (
    <div className="space-y-2 py-4">
      {Array.from({ length: count }).map((_, i) => {
        const item = items[i % items.length];
        return <MessageSkeleton key={i} isMe={item.isMe} width={item.width} />;
      })}
    </div>
  );
};

/**
 * Skeleton cho user profile
 */
export const UserProfileSkeleton: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Avatar & name */}
      <div className="flex flex-col items-center text-center">
        <Skeleton className="w-24 h-24 mb-4" rounded="full" />
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Info items */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-10 h-10" rounded="full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Full page skeleton
 */
export const PageSkeleton: React.FC = () => {
  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar skeleton */}
      <div className="flex w-80 flex-col border-r border-border">
        {/* Header */}
        <div className="border-b border-border px-4 py-4">
          <Skeleton className="h-6 w-32" />
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <Skeleton className="h-10 w-full" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>

        {/* Conversations */}
        <ConversationListSkeleton />
      </div>

      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10" rounded="full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-background">
          <MessageListSkeleton />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
