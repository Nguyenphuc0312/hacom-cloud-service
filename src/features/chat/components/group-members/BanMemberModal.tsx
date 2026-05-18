import React from "react";
import { useTranslation } from "react-i18next";
import { TypedConfirmationModal } from "./TypedConfirmationModal";

interface BanMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
  isLoading?: boolean;
}

export const BanMemberModal: React.FC<BanMemberModalProps> = ({
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
      title={t("profile:groupInfo.banMember")}
      description={t("profile:groupInfo.banMemberConfirm", { name: memberName })}
      confirmText={t("profile:groupInfo.banMember")}
      variant="warning"
      isLoading={isLoading}
    />
  );
};
