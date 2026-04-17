import React from "react";
import clsx from "clsx";
import { Button } from "./Button";

type StateBlockVariant = "empty" | "search-empty" | "error" | "success" | "warning";

interface StateBlockAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost" | "outline";
}

export interface StateBlockProps {
  variant?: StateBlockVariant;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  primaryAction?: StateBlockAction;
  secondaryAction?: StateBlockAction;
  className?: string;
}

const variantClassMap: Record<StateBlockVariant, string> = {
  empty: "border-border/70 bg-surface/82",
  "search-empty": "border-border/70 bg-surface/82",
  error: "border-danger/18 bg-danger/8",
  success: "border-success/18 bg-success/10",
  warning: "border-warning/18 bg-warning/10",
};

export const StateBlock: React.FC<StateBlockProps> = ({
  variant = "empty",
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
}) => {
  return (
    <section
      className={clsx(
        "flex flex-col items-center justify-center rounded-[1.75rem] border px-6 py-8 text-center",
        variantClassMap[variant],
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-overlay text-text-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-title-sm text-text-primary">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-body-sm text-text-secondary">
          {description}
        </p>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? (
            <Button
              type="button"
              variant={primaryAction.variant || "primary"}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              type="button"
              variant={secondaryAction.variant || "secondary"}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default StateBlock;
