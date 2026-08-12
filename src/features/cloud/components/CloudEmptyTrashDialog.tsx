import React from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "../../../components/ui";

interface CloudEmptyTrashDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const CloudEmptyTrashDialog: React.FC<CloudEmptyTrashDialogProps> = ({
  isOpen,
  isLoading,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation("cloud");
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("trash.emptyAllTitle")}
      description={t("trash.emptyAllDescription")}
      size="sm"
      closeOnEsc={!isLoading}
      closeOnOverlayClick={!isLoading}
    >
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={isLoading} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          isLoading={isLoading}
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={() => void onConfirm()}
        >
          {t("trash.emptyAll")}
        </Button>
      </div>
    </Modal>
  );
};
