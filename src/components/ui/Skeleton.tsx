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
  <Skeleton className={className} width={width} height={height} rounded="md" />
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
  <div className={clsx("skeleton-stage py-1", className)} aria-busy="true">
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
        "max-w-[72%] rounded-[var(--chat-bubble-radius)] px-3 py-2",
        isMe ? "bg-primary/[0.07]" : "bg-surface/80",
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
}> = ({ className, count = 5 }) => {
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
      className={clsx(
        "skeleton-stage mx-auto flex w-full max-w-[var(--chat-content-lane)] flex-col gap-1 py-4",
        className,
      )}
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
          <div
            key={index}
            className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4"
          >
            <Skeleton className="h-3.5" width="72%" rounded="sm" />
            <Skeleton
              className="h-3.5"
              width={index % 2 ? "52%" : "78%"}
              rounded="sm"
            />
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
  <section
    className={clsx("app-page-shell h-full", className)}
    data-skeleton-variant="settings"
    aria-busy="true"
  >
    <header className="app-page-header">
      <div className="app-page-header__inner">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5" width={120} rounded="sm" />
          <Skeleton className="h-3" width={240} rounded="sm" />
        </div>
        <SkeletonButton width={116} height={36} />
      </div>
    </header>
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background p-4 sm:p-5 lg:p-6">
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden rounded-[var(--hc-radius-lg)] border border-border bg-surface p-4 md:block">
          <Skeleton className="h-6" width={92} rounded="sm" />
          <Skeleton className="mt-4 h-10 w-full" rounded="md" />
          <div className="mt-5 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg px-2 py-2"
              >
                <SkeletonCircle size={28} className="rounded-md" />
                <Skeleton
                  className="h-4"
                  width={index % 2 ? "54%" : "68%"}
                  rounded="sm"
                />
              </div>
            ))}
          </div>
        </aside>
        <main className="min-w-0 overflow-hidden rounded-[var(--hc-radius-lg)] border border-border bg-surface px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="max-w-[880px] space-y-5">
            <Skeleton className="h-7" width={180} rounded="sm" />
            <Skeleton className="h-4 max-w-full" width={360} rounded="sm" />
            <ProfileSkeleton className="p-0" />
          </div>
        </main>
      </div>
    </div>
  </section>
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
  <div
    className={clsx(
      "rounded-[var(--hc-radius-lg)] border border-border bg-surface",
      className,
    )}
    aria-busy="true"
  >
    <div
      className="grid gap-4 border-b border-border px-4 py-3"
      style={{
        gridTemplateColumns: `${showCheckbox ? "24px " : ""}${showAvatar ? "40px " : ""}repeat(${columns}, minmax(0, 1fr))${showActions ? " 40px" : ""}`,
      }}
    >
      {showCheckbox && <Skeleton className="h-4 w-4" rounded="sm" />}
      {showAvatar && <span />}
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3.5"
          width={index === 0 ? "70%" : "52%"}
          rounded="sm"
        />
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
  <div
    className={clsx("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    aria-busy="true"
  >
    {Array.from({ length: count }).map((_, index) => (
      <div
        key={index}
        className="rounded-[var(--hc-radius-lg)] border border-border bg-surface p-4"
      >
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
  <div
    className={clsx("divide-y divide-border/60", className)}
    aria-busy="true"
  >
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="flex gap-3 px-4 py-3">
        <SkeletonCircle size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <Skeleton
              className="h-4"
              width={index % 2 ? "48%" : "62%"}
              rounded="sm"
            />
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
      <div
        key={index}
        className="flex min-h-[64px] items-center gap-3 rounded-[var(--hc-radius-lg)] px-3 py-2.5"
      >
        <SkeletonCircle size={40} />
        <div className="min-w-0 flex-1">
          <Skeleton
            className="h-4"
            width={index % 2 ? "44%" : "58%"}
            rounded="sm"
          />
          <Skeleton
            className="mt-2 h-3"
            width={index % 3 ? "62%" : "76%"}
            rounded="sm"
          />
        </div>
        <SkeletonButton width={72} height={30} />
      </div>
    ))}
  </div>
);

export type AppRouteSkeletonVariant =
  "list" | "table" | "calendar" | "content" | "workspace";

export const AppRouteSkeleton: React.FC<{
  className?: string;
  variant?: AppRouteSkeletonVariant;
}> = ({ className, variant = "list" }) => {
  const header = (
    <header className="app-page-header">
      <div className="app-page-header__inner">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5" width={148} rounded="sm" />
          <Skeleton className="h-3 max-w-[55vw]" width={280} rounded="sm" />
        </div>
        <div className="flex shrink-0 gap-2">
          <SkeletonButton className="hidden sm:block" width={92} height={36} />
          <SkeletonButton width={108} height={36} />
        </div>
      </div>
    </header>
  );

  let content: React.ReactNode;

  if (variant === "calendar") {
    content = (
      <div className="app-page-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <SkeletonButton width={88} height={36} />
          <Skeleton className="h-5" width={164} rounded="sm" />
          <div className="flex-1" />
          <SkeletonButton width={112} height={36} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7">
          {Array.from({ length: 35 }).map((_, index) => (
            <div
              key={index}
              className="min-h-16 border-b border-r border-border/60 p-2"
            >
              <SkeletonCircle size={18} />
              {index % 5 === 0 ? (
                <Skeleton className="mt-3 h-5 w-full" rounded="sm" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  } else if (variant === "content") {
    content = (
      <div className="app-page-panel mx-auto w-full max-w-4xl overflow-hidden p-5 sm:p-7">
        <Skeleton className="h-7" width="42%" rounded="sm" />
        <SkeletonText
          className="mt-4"
          lines={3}
          widths={["94%", "88%", "68%"]}
        />
        <div className="mt-7 space-y-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="border-t border-border/70 pt-5">
              <Skeleton
                className="h-5"
                width={index % 2 ? "38%" : "52%"}
                rounded="sm"
              />
              <SkeletonText
                className="mt-3"
                lines={2}
                widths={["92%", "64%"]}
              />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (variant === "workspace") {
    content = (
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="app-page-panel hidden min-h-0 p-4 md:block">
          <Skeleton className="h-10 w-full" rounded="md" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 py-2">
                <SkeletonCircle size={32} />
                <Skeleton
                  className="h-4"
                  width={index % 2 ? "58%" : "72%"}
                  rounded="sm"
                />
              </div>
            ))}
          </div>
        </aside>
        <main className="app-page-panel min-h-0 p-5 sm:p-7">
          <Skeleton className="h-7" width="36%" rounded="sm" />
          <SkeletonText className="mt-4" lines={2} widths={["72%", "48%"]} />
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[var(--hc-radius-lg)] border border-border p-4"
              >
                <SkeletonCircle size={36} />
                <Skeleton className="mt-4 h-4" width="64%" rounded="sm" />
                <Skeleton className="mt-3 h-3" width="82%" rounded="sm" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  } else {
    content = (
      <div className="app-page-panel min-h-0 flex-1 overflow-hidden">
        <div className="flex gap-3 border-b border-border p-4">
          <Skeleton className="h-10 min-w-0 flex-1" rounded="md" />
          <SkeletonButton width={104} height={40} />
        </div>
        {variant === "table" ? (
          <TableSkeleton
            className="rounded-none border-0"
            rows={7}
            columns={4}
            showAvatar
          />
        ) : (
          <DirectorySkeleton className="p-2" count={7} />
        )}
      </div>
    );
  }

  return (
    <section
      className={clsx("app-page-shell h-full", className)}
      data-skeleton-variant={variant}
      aria-busy="true"
    >
      {header}
      <div className="app-page-body">{content}</div>
    </section>
  );
};

export const AuthFormSkeleton: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => (
  <div
    className={clsx("skeleton-stage", compact ? "space-y-4" : "space-y-5")}
    aria-busy="true"
  >
    <Skeleton className="mx-auto h-16 w-28" rounded="lg" />
    <div className="space-y-2 text-center">
      <Skeleton className="mx-auto h-6" width="68%" rounded="sm" />
      <Skeleton className="mx-auto h-3.5" width="76%" rounded="sm" />
    </div>
    <Skeleton className="h-12 w-full" rounded="lg" />
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3.5" width="34%" rounded="sm" />
        <Skeleton className="h-12 w-full" rounded="md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5" width="26%" rounded="sm" />
        <Skeleton className="h-12 w-full" rounded="md" />
      </div>
      <div className="flex h-6 items-center justify-between">
        <Skeleton className="h-3.5" width="34%" rounded="sm" />
        <Skeleton className="h-3.5" width="30%" rounded="sm" />
      </div>
      <Skeleton className="h-12 w-full" rounded="md" />
    </div>
  </div>
);

export const AuthPageSkeleton: React.FC<{
  className?: string;
  variant?: "split" | "card";
}> = ({ className, variant = "split" }) => {
  if (variant === "card") {
    return (
      <div
        className={clsx("auth-shell", className)}
        data-skeleton-variant="auth-card"
        aria-busy="true"
      >
        <div className="auth-shell-inner max-w-md">
          <section className="auth-card p-6 sm:p-7">
            <AuthFormSkeleton compact />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex h-[var(--app-dvh)] w-full overflow-hidden bg-surface-overlay",
        className,
      )}
      data-skeleton-variant="auth-split"
      aria-busy="true"
    >
      <div className="relative hidden w-1/2 overflow-hidden bg-gray-900 lg:block">
        <img
          src="/hacom-imperial-dalat.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        <div className="absolute inset-x-0 bottom-0 p-[clamp(24px,4vw,64px)] text-white">
          <h2 className="text-[clamp(1.5rem,3.5vw,3rem)] font-bold leading-[1.1] tracking-tight">
            Hacom Imperial Dalat
          </h2>
          <p className="mt-3 max-w-2xl text-[clamp(0.875rem,1.5vw,1.25rem)] font-light leading-relaxed text-white/90">
            Dự án nổi bật tại Đà Lạt - Kiến trúc tân cổ điển sang trọng giữa
            ngàn hoa
          </p>
          <div className="mt-8 grid grid-cols-4 gap-3">
            <span className="h-1 rounded-full bg-white" />
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index} className="h-1 rounded-full bg-white/20" />
            ))}
          </div>
        </div>
      </div>
      <div className="w-full overflow-y-auto bg-surface-overlay lg:w-1/2">
        <div className="flex min-h-[var(--app-dvh)] items-center justify-center px-[clamp(12px,3vw,40px)] py-[clamp(16px,4dvh,40px)]">
          <div className="w-full max-w-[clamp(320px,90vw,500px)] rounded-3xl border border-border bg-surface-raised px-[clamp(16px,4vw,36px)] py-[clamp(20px,3.5dvh,36px)] shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgb(0,0,0,0.5)]">
            <AuthFormSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatWorkspaceSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => (
  <div
    className={clsx(
      "grid h-full min-h-0 w-full grid-cols-[var(--hc-sidebar-width)_minmax(0,1fr)] overflow-hidden bg-background max-md:grid-cols-1",
      className,
    )}
    aria-busy="true"
  >
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
      <ConversationListSkeleton count={6} />
    </div>
    <div className="flex min-h-0 min-w-0 flex-col bg-background max-md:hidden">
      <ChatHeaderSkeleton />
      <div className="chat-background min-h-0 flex-1 overflow-hidden px-[var(--chat-lane-padding)]">
        <MessageListSkeleton count={5} />
      </div>
      <MessageComposerSkeleton />
    </div>
  </div>
);

export default Skeleton;
