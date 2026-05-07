import React from "react";
import clsx from "clsx";
import {
  ClockIcon,
  LockClosedIcon,
  NoSymbolIcon,
  ServerStackIcon,
  ShieldExclamationIcon,
  SignalSlashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../ui";

export type AppErrorVariant =
  | "not-found"
  | "forbidden"
  | "unauthorized"
  | "rate-limit"
  | "server"
  | "offline"
  | "maintenance";

export interface AppErrorAction {
  label: string;
  to?: string;
  onClick?: () => void;
  reload?: boolean;
  back?: boolean;
  disabled?: boolean;
}

export interface AppErrorPageProps {
  statusCode?: 401 | 403 | 404 | 429 | 500 | 502 | 503 | 504;
  title: string;
  description: string;
  primaryAction?: AppErrorAction;
  secondaryAction?: AppErrorAction;
  details?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  variant?: AppErrorVariant;
  className?: string;
}

const variantIcons: Record<AppErrorVariant, React.ReactNode> = {
  "not-found": <NoSymbolIcon />,
  forbidden: <ShieldExclamationIcon />,
  unauthorized: <LockClosedIcon />,
  "rate-limit": <ClockIcon />,
  server: <ServerStackIcon />,
  offline: <SignalSlashIcon />,
  maintenance: <WrenchScrewdriverIcon />,
};

const renderAction = (
  action: AppErrorAction,
  variant: "primary" | "secondary",
  navigate: ReturnType<typeof useNavigate>,
) => {
  const linkClassName = clsx(
    "inline-flex min-h-[var(--control-height-sm)] min-w-[8rem] items-center justify-center rounded-md px-3 text-body-sm font-medium transition-micro",
    "focus:outline-none focus:ring-2 focus:ring-focus/25 focus:ring-offset-2 focus:ring-offset-surface",
    variant === "primary"
      ? "border border-primary bg-primary text-text-inverse hover:bg-primary-hover"
      : "border border-border bg-surface-overlay text-text-primary hover:bg-surface-hover",
    action.disabled && "pointer-events-none opacity-65",
  );
  const className = "min-w-[8rem]";
  const buttonVariant = variant === "primary" ? "primary" : "secondary";
  const handleClick = () => {
    if (action.reload) {
      window.location.reload();
      return;
    }
    if (action.back) {
      navigate(-1);
      return;
    }
    action.onClick?.();
  };

  if (action.to) {
    return (
      <Link
        to={action.to}
        className={linkClassName}
        aria-disabled={action.disabled ? true : undefined}
        tabIndex={action.disabled ? -1 : undefined}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant={buttonVariant}
      size="sm"
      className={className}
      onClick={handleClick}
      disabled={action.disabled}
    >
      {action.label}
    </Button>
  );
};

export const AppErrorPage: React.FC<AppErrorPageProps> = ({
  statusCode,
  title,
  description,
  primaryAction,
  secondaryAction,
  details,
  requestId,
  retryAfterSeconds,
  variant = "server",
  className,
}) => {
  const navigate = useNavigate();
  const showDetails =
    import.meta.env.DEV &&
    import.meta.env.VITE_ERROR_DETAILS_DEBUG === "true" &&
    details;

  return (
    <main
      className={clsx(
        "flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-text-primary",
        className,
      )}
      aria-labelledby="app-error-title"
    >
      <section className="w-full max-w-[34rem] rounded-xl border border-border bg-surface px-6 py-6 shadow-[var(--shadow-xs)] sm:px-7">
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
              "border-border bg-surface-overlay text-text-secondary",
            )}
            aria-hidden="true"
          >
            <span className="h-5 w-5">{variantIcons[variant]}</span>
          </div>
          <div className="min-w-0 flex-1">
            {statusCode ? (
              <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                Lỗi {statusCode}
              </p>
            ) : null}
            <h1
              id="app-error-title"
              className="mt-1 text-lg font-semibold leading-7 text-text-primary"
            >
              {title}
            </h1>
            <p className="mt-2 text-body-sm leading-6 text-text-secondary">
              {description}
            </p>
            {retryAfterSeconds !== undefined ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-surface-overlay px-2.5 py-1 text-caption font-medium text-text-secondary">
                <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Có thể thử lại sau {retryAfterSeconds}s
              </p>
            ) : null}
            {requestId ? (
              <p className="mt-3 break-all text-caption text-text-muted">
                Mã yêu cầu: <span className="font-medium">{requestId}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          {primaryAction ? renderAction(primaryAction, "primary", navigate) : null}
          {secondaryAction ? renderAction(secondaryAction, "secondary", navigate) : null}
        </div>

        {showDetails ? (
          <details className="mt-5 rounded-lg border border-border bg-surface-overlay p-3 text-caption text-text-secondary">
            <summary className="cursor-pointer font-medium text-text-primary">
              Chi tiết kỹ thuật
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
              {details}
            </pre>
          </details>
        ) : null}

        <div className="sr-only" aria-live="polite">
          {variant === "offline" ? "Ứng dụng đang mất kết nối mạng" : title}
        </div>
      </section>
    </main>
  );
};

export default AppErrorPage;
