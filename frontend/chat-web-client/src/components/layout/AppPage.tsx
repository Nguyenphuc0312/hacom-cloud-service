import React from "react";
import clsx from "clsx";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface AppPageProps {
  children: React.ReactNode;
  className?: string;
  layout?: "workspace" | "narrow";
}

interface AppPageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

interface AppPageBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface AppSectionIntroProps {
  title: string;
  description?: string;
  className?: string;
}

export const AppPage: React.FC<AppPageProps> = ({
  children,
  className,
  layout = "workspace",
}) => (
  <section
    className={clsx("app-page-shell", `app-page-shell--${layout}`, className)}
  >
    {children}
  </section>
);

export const AppPageHeader: React.FC<AppPageHeaderProps> = ({
  title,
  subtitle,
  badge,
  meta,
  actions,
  onBack,
  backLabel = "Back",
  className,
}) => {
  return (
    <header className={clsx("app-page-header", className)}>
      <div className="app-page-header__inner">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="app-page-back-button"
            aria-label={backLabel}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-text-primary">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {subtitle}
            </p>
          ) : null}
        </div>

        {meta ? <div className="hidden lg:block">{meta}</div> : null}
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
};

export const AppPageBody: React.FC<AppPageBodyProps> = ({
  children,
  className,
}) => <div className={clsx("app-page-body", className)}>{children}</div>;

export const AppSectionIntro: React.FC<AppSectionIntroProps> = ({
  title,
  description,
  className,
}) => (
  <div className={clsx("space-y-1", className)}>
    <h2 className="text-title text-text-primary">{title}</h2>
    {description ? (
      <p className="text-body-sm text-text-secondary">{description}</p>
    ) : null}
  </div>
);

export default AppPage;
