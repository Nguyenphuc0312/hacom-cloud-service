import React from "react";
import { useTranslation } from "react-i18next";
import { TypedConfirmationModal } from "./TypedConfirmationModal";

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
  isLoading?: boolean;
}

export const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  memberName,
  isLoading = false,
}) => {
  const { t } = useTranslation("profile");

  return (
    <TypedConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("profile:groupInfo.transferOwnership")}
      description={t("profile:groupInfo.transferOwnershipConfirm", {
        name: memberName,
      })}
      confirmText={t("common:actions.confirm", { defaultValue: "Confirm" })}
      variant="warning"
      isLoading={isLoading}
    />
  );
};
