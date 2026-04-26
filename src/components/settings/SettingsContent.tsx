import React from "react";
import clsx from "clsx";

interface SettingsContentProps {
  notice?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  constrained?: boolean;
}

export const SettingsContent = React.forwardRef<HTMLDivElement, SettingsContentProps>(
  (
    {
      notice,
      header,
      children,
      className,
      bodyClassName,
      constrained = true,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        data-settings-pane="content"
        data-settings-scroll-root="true"
        className={clsx(
          "h-full min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-border bg-background",
          className,
        )}
      >
        <div
          className={clsx(
            "mx-auto flex min-h-full w-full flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8",
            constrained && "max-w-[1040px]",
            bodyClassName,
          )}
        >
          {notice}
          {header}
          {children}
        </div>
      </div>
    );
  },
);

SettingsContent.displayName = "SettingsContent";

export default SettingsContent;
