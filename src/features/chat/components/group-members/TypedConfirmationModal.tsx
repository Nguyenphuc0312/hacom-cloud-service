import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Modal } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";

interface TypedConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText: string;
  cancelText?: string;
  variant: "danger" | "warning";
  isLoading?: boolean;
  confirmDisabled?: boolean;
  /** For delete group: the exact group name to require for confirmation */
  requiredConfirmationText?: string;
  /** The actual text the user needs to type */
  confirmationHint?: string;
}

export const TypedConfirmationModal: React.FC<TypedConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  variant,
  isLoading = false,
  confirmDisabled = false,
  requiredConfirmationText,
  confirmationHint,
}) => {
  const { t } = useTranslation("common");
  const [typedText, setTypedText] = React.useState("");

  const isTypedConfirmationValid =
    !requiredConfirmationText ||
    typedText.trim().toLowerCase() === requiredConfirmationText.trim().toLowerCase();

  const canConfirm =
    !requiredConfirmationText || isTypedConfirmationValid;

  const iconBgClass = variant === "danger" ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="text-center">
        <div
          className={clsx(
            "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
            iconBgClass,
          )}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-text-primary">{title}</h3>

        {description && (
          <p className="mb-4 text-sm text-text-secondary">{description}</p>
        )}

        {requiredConfirmationText && (
          <div className="mb-4 text-left">
            <p className="mb-2 text-sm text-text-secondary">
              {confirmationHint ||
                t("profile:groupInfo.deleteGroup.typeToConfirm", {
                  defaultValue: 'Type "{{text}}" to confirm',
                  text: requiredConfirmationText,
                })}
            </p>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={requiredConfirmationText}
              className={clsx(
                "w-full rounded-md border px-3 py-2 text-sm",
                "border-border bg-surface text-text-primary",
                "placeholder:text-text-muted",
                "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/30",
              )}
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={isLoading}
            onClick={onClose}
          >
            {cancelText || t("actions.cancel")}
          </Button>

          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "primary"}
            fullWidth
            disabled={isLoading || !canConfirm || confirmDisabled}
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
