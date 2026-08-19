import React from "react";
import { useTranslation } from "react-i18next";
import {
  ExclamationTriangleIcon,
  LockClosedIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../../components/ui";

interface LockedOrDisabledStateProps {
  status: "locked" | "disabled";
  message?: string | null;
  onReset?: () => void;
}

export const LockedOrDisabledState: React.FC<LockedOrDisabledStateProps> = ({
  status,
  message,
  onReset,
}) => {
  const { t } = useTranslation("auth");
  const isDisabled = status === "disabled";
  const title = isDisabled
    ? t("activation.locked.disabledTitle", {
        defaultValue: "Account disabled",
      })
    : t("activation.locked.lockedTitle", {
        defaultValue: "Account locked",
      });
  const description = isDisabled
    ? t("activation.locked.accountDisabled")
    : t("activation.locked.accountLocked");
  const Icon = isDisabled ? NoSymbolIcon : LockClosedIcon;

  return (
    <section className="space-y-4 rounded-2xl border border-danger/25 bg-danger/8 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-danger/12 p-2 text-danger">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="text-sm text-text-secondary">{description}</p>
        </div>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {onReset ? (
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="w-full"
        >
          {t("activation.locked.tryAnother", {
            defaultValue: "Try another account",
          })}
        </Button>
      ) : null}
    </section>
  );
};

export default LockedOrDisabledState;
