import React from "react";
import { useTranslation } from "react-i18next";
import { TypedConfirmationModal } from "./TypedConfirmationModal";

interface RemoveMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
  isLoading?: boolean;
}

export const RemoveMemberModal: React.FC<RemoveMemberModalProps> = ({
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
      title={t("profile:groupInfo.actions.removeMember", {
        defaultValue: "Remove member",
      })}
      description={t("profile:groupInfo.removeMemberConfirm", {
        name: memberName,
      })}
      confirmText={t("profile:groupInfo.actions.removeMember", {
        defaultValue: "Remove",
      })}
      variant="danger"
      isLoading={isLoading}
    />
  );
};
