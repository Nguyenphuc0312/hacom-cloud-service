/**
 * @fileoverview Reusable skeleton loading components.
 */

import React from "react";
import clsx from "clsx";

type SkeletonRadius = "none" | "sm" | "md" | "lg" | "full";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: SkeletonRadius;
}

interface SkeletonTextProps {
  className?: string;
  lineClassName?: string;
  lines?: number;
  widths?: Array<string | number>;
}

const roundedClasses: Record<SkeletonRadius, string> = {
  none: "rounded-none",
  sm: "rounded-[var(--skeleton-radius-sm)]",
  md: "rounded-[var(--skeleton-radius-md)]",
  lg: "rounded-[var(--skeleton-radius-lg)]",
  full: "rounded-full",
};

const toCssSize = (value?: string | number): string | undefined =>
  typeof value === "number" ? `${value}px` : value;

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  width,
  height,
  rounded = "md",
}) => (
  <div
    className={clsx("skeleton", roundedClasses[rounded], className)}
    style={{
      width: toCssSize(width),
      height: toCssSize(height),
    }}
    aria-hidden="true"
  />
);

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  className,
  lineClassName,
  lines = 1,
  widths,
}) => {
  const defaultWidths = ["100%", "82%", "64%", "74%"];

  return (
    <div className={clsx("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={clsx("h-3.5", lineClassName)}
          width={widths?.[index] ?? defaultWidths[index % defaultWidths.length]}
          rounded="sm"
        />
      ))}
    </div>
  );
};

export const SkeletonCircle: React.FC<{
  className?: string;
  size?: string | number;
}> = ({ className, size = 40 }) => (
  <Skeleton
    className={clsx("shrink-0", className)}
    width={size}
    height={size}
    rounded="full"
  />
);

export const SkeletonButton: React.FC<{
  className?: string;
  width?: string | number;
  height?: string | number;
}> = ({ className, width = 96, height = 36 }) => (
  <Skeleton
    className={className}
    width={width}
    height={height}
    rounded="md"
  />
);

export const ConversationItemSkeleton: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => (
  <div className="mx-2 my-1 flex min-h-[68px] items-center gap-3 rounded-[var(--hc-radius-lg)] px-3 py-3">
    <SkeletonCircle size={compact ? 36 : 40} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 min-w-0 flex-1" width="58%" rounded="sm" />
        <Skeleton className="h-3 shrink-0" width={38} rounded="sm" />
      </div>
      <SkeletonText
        className="mt-2"
        lines={1}
        widths={[compact ? "68%" : "84%"]}
        lineClassName="h-3"
      />
    </div>
    <Skeleton className="h-5 w-5 shrink-0" rounded="full" />
  </div>
);

export const ConversationSkeleton = ConversationItemSkeleton;

export const ConversationListSkeleton: React.FC<{
  className?: string;
  count?: number;
  compact?: boolean;
}> = ({ className, count = 7, compact }) => (
  <div className={clsx("py-1", className)} aria-busy="true">
    {Array.from({ length: count }).map((_, index) => (
      <ConversationItemSkeleton key={index} compact={compact} />
    ))}
  </div>
);

export const ChatHeaderSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={clsx(
      "flex h-[var(--hc-header-height)] items-center justify-between border-b border-border bg-surface px-4",
      className,
    )}
    aria-busy="true"
  >
    <div className="flex min-w-0 items-center gap-3">
      <SkeletonCircle size={40} />
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-4" width={160} rounded="sm" />
        <Skeleton className="h-3" width={96} rounded="sm" />
      </div>
    </div>
    <div className="flex items-center gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <SkeletonCircle key={index} size={32} className="rounded-md" />
      ))}
    </div>
  </div>
);

export const MessageBubbleSkeleton: React.FC<{
  isMe?: boolean;
  width?: string | number;
  lines?: number;
}> = ({ isMe = false, width = "48%", lines = 1 }) => (
  <div
    className={clsx(
      "flex gap-2 px-1 py-1.5",
      isMe ? "flex-row-reverse" : "flex-row",
    )}
  >
    {!isMe && <SkeletonCircle size={32} />}
    <div
      className={clsx(
        "max-w-[72%] rounded-[var(--chat-bubble-radius)] border px-3 py-2 shadow-xs",
        isMe
          ? "border-primary/10 bg-primary/10"
          : "border-border/70 bg-surface",
      )}
      style={{ width: toCssSize(width) }}
    >
      <SkeletonText
        lines={lines}
        widths={lines > 1 ? ["100%", "72%"] : ["88%"]}
        lineClassName="h-3.5"
      />
      <Skeleton className="mt-2 h-2.5" width={52} rounded="sm" />
    </div>
  </div>
);

export const MessageSkeleton = MessageBubbleSkeleton;

export const MessageListSkeleton: React.FC<{
  className?: string;
  count?: number;
}> = ({ className, count = 9 }) => {
  const pattern = [
    { isMe: false, width: "48%", lines: 1 },
    { isMe: true, width: "42%", lines: 1 },
    { isMe: false, width: "58%", lines: 2 },
    { isMe: false, width: "34%", lines: 1 },
    { isMe: true, width: "52%", lines: 2 },
    { isMe: false, width: "46%", lines: 1 },
    { isMe: true, width: "36%", lines: 1 },
    { isMe: false, width: "62%", lines: 2 },
    { isMe: true, width: "44%", lines: 1 },
  ];

  return (
    <div
      className={clsx("mx-auto flex w-full max-w-[var(--chat-content-lane)] flex-col gap-1 py-4", className)}
      aria-busy="true"
    >
      <div className="mb-2 flex justify-center">
        <Skeleton className="h-6" width={112} rounded="full" />
      </div>
      {Array.from({ length: count }).map((_, index) => {
        const item = pattern[index % pattern.length];
        return (
          <MessageBubbleSkeleton
            key={index}
            isMe={item.isMe}
            width={item.width}
            lines={item.lines}
          />
        );
      })}
    </div>
  );
};

export const MessageComposerSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={clsx("border-t border-border bg-surface px-4 py-3", className)}
    aria-busy="true"
  >
    <div className="flex items-center gap-2">
      <SkeletonCircle size={36} className="rounded-md" />
      <Skeleton className="h-11 min-w-0 flex-1" rounded="lg" />
      <SkeletonCircle size={40} />
    </div>
  </div>
);

export const ProfileSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div className={clsx("space-y-5 p-4", className)} aria-busy="true">
    <div className="rounded-[var(--hc-radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-start gap-4">
        <SkeletonCircle size={64} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-5" width="58%" rounded="sm" />
          <Skeleton className="h-3.5" width="44%" rounded="sm" />
          <Skeleton className="h-3.5" width="36%" rounded="sm" />
        </div>
        <SkeletonButton width={92} height={34} />
      </div>
    </div>
    <div className="rounded-[var(--hc-radius-lg)] border border-border bg-surface p-4">
      <Skeleton className="mb-4 h-4" width={144} rounded="sm" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4">
            <Skeleton className="h-3.5" width="72%" rounded="sm" />
            <Skeleton className="h-3.5" width={index % 2 ? "52%" : "78%"} rounded="sm" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const UserProfileSkeleton = ProfileSkeleton;

export const SettingsSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={clsx("grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-background", className)}
    aria-busy="true"
  >
    <aside className="border-r border-border bg-surface p-4">
      <Skeleton className="h-6" width={92} rounded="sm" />
      <Skeleton className="mt-4 h-10 w-full" rounded="md" />
      <div className="mt-5 space-y-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg px-2 py-2">
            <SkeletonCircle size={28} className="rounded-md" />
            <Skeleton className="h-4" width={index % 2 ? "54%" : "68%"} rounded="sm" />
          </div>
        ))}
      </div>
    </aside>
    <main className="min-w-0 overflow-y-auto px-8 py-7">
      <div className="max-w-[880px] space-y-5">
        <Skeleton className="h-7" width={180} rounded="sm" />
        <Skeleton className="h-4" width={360} rounded="sm" />
        <ProfileSkeleton className="p-0" />
      </div>
    </main>
  </div>
);

export const TableSkeleton: React.FC<{
  className?: string;
  rows?: number;
  columns?: number;
  showCheckbox?: boolean;
  showAvatar?: boolean;
  showActions?: boolean;
}> = ({
  className,
  rows = 6,
  columns = 4,
  showCheckbox = false,
  showAvatar = false,
  showActions = true,
}) => (
  <div className={clsx("rounded-[var(--hc-radius-lg)] border border-border bg-surface", className)} aria-busy="true">
    <div
      className="grid gap-4 border-b border-border px-4 py-3"
      style={{
        gridTemplateColumns: `${showCheckbox ? "24px " : ""}${showAvatar ? "40px " : ""}repeat(${columns}, minmax(0, 1fr))${showActions ? " 40px" : ""}`,
      }}
    >
      {showCheckbox && <Skeleton className="h-4 w-4" rounded="sm" />}
      {showAvatar && <span />}
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} className="h-3.5" width={index === 0 ? "70%" : "52%"} rounded="sm" />
      ))}
      {showActions && <span />}
    </div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div
        key={rowIndex}
        className="grid items-center gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
        style={{
          gridTemplateColumns: `${showCheckbox ? "24px " : ""}${showAvatar ? "40px " : ""}repeat(${columns}, minmax(0, 1fr))${showActions ? " 40px" : ""}`,
        }}
      >
        {showCheckbox && <Skeleton className="h-4 w-4" rounded="sm" />}
        {showAvatar && <SkeletonCircle size={36} />}
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-3.5"
            width={index === 0 ? "86%" : rowIndex % 2 ? "54%" : "68%"}
            rounded="sm"
          />
        ))}
        {showActions && <SkeletonCircle size={28} className="rounded-md" />}
      </div>
    ))}
  </div>
);

export const CardGridSkeleton: React.FC<{
  className?: string;
  count?: number;
}> = ({ className, count = 6 }) => (
  <div className={clsx("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="rounded-[var(--hc-radius-lg)] border border-border bg-surface p-4">
        <Skeleton className="aspect-video w-full" rounded="lg" />
        <Skeleton className="mt-4 h-4" width="72%" rounded="sm" />
        <Skeleton className="mt-2 h-3.5" width="54%" rounded="sm" />
      </div>
    ))}
  </div>
);

export const NotificationListSkeleton: React.FC<{
  className?: string;
  count?: number;
}> = ({ className, count = 5 }) => (
  <div className={clsx("divide-y divide-border/60", className)} aria-busy="true">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="flex gap-3 px-4 py-3">
        <SkeletonCircle size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4" width={index % 2 ? "48%" : "62%"} rounded="sm" />
            <Skeleton className="h-3" width={40} rounded="sm" />
          </div>
          <SkeletonText
            className="mt-2"
            lineClassName="h-3"
            lines={2}
            widths={["86%", "58%"]}
          />
        </div>
      </div>
    ))}
  </div>
);

export const DirectorySkeleton: React.FC<{
  className?: string;
  count?: number;
}> = ({ className, count = 6 }) => (
  <div className={clsx("space-y-1", className)} aria-busy="true">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="flex min-h-[64px] items-center gap-3 rounded-[var(--hc-radius-lg)] px-3 py-2.5">
        <SkeletonCircle size={40} />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4" width={index % 2 ? "44%" : "58%"} rounded="sm" />
          <Skeleton className="mt-2 h-3" width={index % 3 ? "62%" : "76%"} rounded="sm" />
        </div>
        <SkeletonButton width={72} height={30} />
      </div>
    ))}
  </div>
);

export const PageSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={clsx("grid h-dvh min-h-dvh grid-cols-[var(--hc-rail-width)_var(--hc-sidebar-width)_minmax(0,1fr)] overflow-hidden bg-background", className)}
    aria-busy="true"
  >
    <div className="hc-side-rail">
      <SkeletonCircle size={34} className="bg-white/20" />
      <div className="mt-4 flex flex-1 flex-col gap-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <SkeletonCircle key={index} size={36} className="bg-white/20" />
        ))}
      </div>
      <SkeletonCircle size={34} className="bg-white/20" />
    </div>
    <div className="min-h-0 border-r border-border bg-surface">
      <div className="border-b border-border px-4 py-4">
        <Skeleton className="h-6" width={132} rounded="sm" />
        <Skeleton className="mt-3 h-10 w-full" rounded="md" />
      </div>
      <div className="flex gap-2 px-4 py-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 flex-1" rounded="md" />
        ))}
      </div>
      <ConversationListSkeleton count={7} />
    </div>
    <div className="flex min-h-0 min-w-0 flex-col bg-background">
      <ChatHeaderSkeleton />
      <div className="chat-background min-h-0 flex-1 overflow-hidden px-[var(--chat-lane-padding)]">
        <MessageListSkeleton />
      </div>
      <MessageComposerSkeleton />
    </div>
  </div>
);

export default Skeleton;
