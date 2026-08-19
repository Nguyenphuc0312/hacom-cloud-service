import React from "react";
import clsx from "clsx";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../ui";
import { ClockIcon } from "@heroicons/react/24/outline";

// Illustrations
import maintenanceIllustration from "../../assets/images/maintenance-illustration.jpg";
import errorIllustration from "../../assets/images/error-illustration.jpg";

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
  details?: string; // Kept for interface compatibility, but unused in UI
  requestId?: string;
  retryAfterSeconds?: number;
  variant?: AppErrorVariant;
  className?: string;
}

const renderAction = (
  action: AppErrorAction,
  variant: "primary" | "secondary",
  navigate: ReturnType<typeof useNavigate>,
) => {
  const linkClassName = clsx(
    "inline-flex min-h-[var(--control-height-md)] min-w-[8rem] items-center justify-center rounded-lg px-4 text-body-sm font-semibold transition-micro",
    "focus:outline-none focus:ring-2 focus:ring-focus/30",
    variant === "primary"
      ? "bg-primary text-text-inverse hover:bg-primary-hover shadow-sm"
      : "bg-surface-overlay text-text-primary hover:bg-surface-hover border border-border shadow-sm",
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
      size="md"
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
  requestId,
  retryAfterSeconds,
  variant = "server",
  className,
}) => {
  const navigate = useNavigate();

  const isMaintenanceOrNotFound = variant === "maintenance" || variant === "not-found";
  const illustrationSrc = isMaintenanceOrNotFound ? maintenanceIllustration : errorIllustration;

  return (
    <main
      className={clsx(
        "flex min-h-[var(--app-dvh)] w-full flex-col items-center justify-center bg-background px-4 py-8 text-text-primary overflow-hidden",
        className,
      )}
      aria-labelledby="app-error-title"
    >
      <section className="flex w-full max-w-md flex-col items-center text-center animate-fade-in">
        <div className="mb-[clamp(16px,3dvh,28px)] flex justify-center">
          <img
            src={illustrationSrc}
            alt={isMaintenanceOrNotFound ? "Bảo trì" : "Lỗi ứng dụng"}
            className="h-auto max-w-full object-contain drop-shadow-sm"
            style={{ width: "clamp(160px, 35vmin, 280px)" }}
          />
        </div>

        {statusCode && (
          <div className="mb-3 rounded-full bg-surface-overlay px-3 py-1 text-xs font-semibold tracking-wider text-text-muted border border-border">
            MÃ LỖI {statusCode}
          </div>
        )}

        <h1
          id="app-error-title"
          className="font-bold tracking-tight text-text-primary"
          style={{ fontSize: "clamp(1.25rem, 3vw, 1.875rem)" }}
        >
          {title}
        </h1>

        <p className="mt-3 max-w-sm text-body text-text-secondary leading-relaxed">
          {description}
        </p>

        {retryAfterSeconds !== undefined && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning-dark">
            <ClockIcon className="h-4 w-4" aria-hidden="true" />
            Có thể thử lại sau {retryAfterSeconds} giây
          </p>
        )}

        {requestId && (
          <p className="mt-4 text-xs text-text-muted">
            Mã yêu cầu: <span className="font-mono">{requestId}</span>
          </p>
        )}

        <div className="mt-[clamp(16px,3dvh,32px)] flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          {primaryAction ? renderAction(primaryAction, "primary", navigate) : null}
          {secondaryAction ? renderAction(secondaryAction, "secondary", navigate) : null}
        </div>

        <div className="sr-only" aria-live="polite">
          {variant === "offline" ? "Ứng dụng đang mất kết nối mạng" : title}
        </div>
      </section>
    </main>
  );
};

export default AppErrorPage;
