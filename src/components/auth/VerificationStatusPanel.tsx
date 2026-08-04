import React from "react";
import clsx from "clsx";

export type VerificationStatusTone = "info" | "warning" | "danger" | "success";

export interface VerificationStatusPanelProps {
  title: string;
  description: string;
  tone?: VerificationStatusTone;
  helperText?: string | null;
}

const toneClassName: Record<VerificationStatusTone, string> = {
  info: "border-border bg-surface-overlay text-text-secondary",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
};

export const VerificationStatusPanel: React.FC<
  VerificationStatusPanelProps
> = ({ title, description, tone = "info", helperText }) => {
  return (
    <section
      className={clsx("rounded-2xl border px-4 py-4", toneClassName[tone])}
      aria-live="polite"
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm">{description}</p>
      {helperText ? (
        <p className="mt-2 text-xs opacity-90">{helperText}</p>
      ) : null}
    </section>
  );
};

export default VerificationStatusPanel;
