import React from "react";
import clsx from "clsx";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type InlineNoticeTone = "info" | "success" | "warning" | "error";

interface InlineNoticeProps {
  tone?: InlineNoticeTone;
  message: string;
  action?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const toneClasses: Record<InlineNoticeTone, string> = {
  info: "border-[hsl(var(--state-info-border))] bg-[hsl(var(--state-info-bg))] text-primary",
  success:
    "border-[hsl(var(--state-success-border))] bg-[hsl(var(--state-success-bg))] text-success",
  warning:
    "border-[hsl(var(--state-warning-border))] bg-[hsl(var(--state-warning-bg))] text-warning",
  error:
    "border-[hsl(var(--state-danger-border))] bg-[hsl(var(--state-danger-bg))] text-danger",
};

const toneIcons: Record<InlineNoticeTone, React.ReactNode> = {
  info: <InformationCircleIcon className="h-4 w-4" />,
  success: <CheckCircleIcon className="h-4 w-4" />,
  warning: <ExclamationTriangleIcon className="h-4 w-4" />,
  error: <XCircleIcon className="h-4 w-4" />,
};

export const InlineNotice: React.FC<InlineNoticeProps> = ({
  tone = "info",
  message,
  action,
  dismissible = false,
  onDismiss,
  className,
}) => {
  // Errors/warnings interrupt (assertive alert); info/success announce politely.
  const isUrgent = tone === "error" || tone === "warning";
  return (
    <div
      className={clsx(
        "inline-notice flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm backdrop-blur-sm motion-enter-soft",
        toneClasses[tone],
        className,
      )}
      role={isUrgent ? "alert" : "status"}
      aria-live={isUrgent ? "assertive" : "polite"}
    >
      <span className="shrink-0">{toneIcons[tone]}</span>
      <p className="min-w-0 flex-1 truncate font-medium">{message}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
      {dismissible && onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-fast hover:bg-surface-overlay"
          aria-label="Dismiss notice"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};

export default InlineNotice;
