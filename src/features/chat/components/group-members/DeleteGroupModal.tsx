import React from "react";
import { useTranslation } from "react-i18next";
import { TypedConfirmationModal } from "./TypedConfirmationModal";

interface DeleteGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  groupName: string;
  isLoading?: boolean;
}

export const DeleteGroupModal: React.FC<DeleteGroupModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  groupName,
  isLoading = false,
}) => {
  const { t } = useTranslation("profile");

  return (
    <TypedConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("profile:groupInfo.deleteGroup")}
      description={t("profile:groupInfo.deleteGroupWarning", {
        defaultValue: "This action cannot be undone. All messages, files, and group data will be permanently deleted.",
      })}
      confirmText={t("profile:groupInfo.deleteGroup")}
      variant="danger"
      isLoading={isLoading}
      requiredConfirmationText={groupName}
      confirmationHint={t("profile:groupInfo.deleteGroup.typeToConfirm", {
        defaultValue: 'Type the group name to confirm deletion',
      })}
    />
  );
};
