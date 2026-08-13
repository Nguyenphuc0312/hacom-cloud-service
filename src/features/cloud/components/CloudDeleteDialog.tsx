import React, { useState } from "react";
import { Clock3, Trash2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "../../../components/ui";
import type { CloudItem } from "../types";

interface CloudDeleteDialogProps {
  item: CloudItem | null;
  permanentOnly?: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onTrash: (itemId: string) => Promise<void>;
  onPermanentDelete: (itemId: string) => Promise<void>;
}

export const CloudDeleteDialog: React.FC<CloudDeleteDialogProps> = ({
  item,
  permanentOnly = false,
  isLoading = false,
  onClose,
  onTrash,
  onPermanentDelete,
}) => {
  const { t } = useTranslation("cloud");
  const [pendingAction, setPendingAction] = useState<"trash" | "delete" | null>(
    null,
  );
  const runAction = async (action: "trash" | "delete") => {
    if (!item) return;
    setPendingAction(action);
    try {
      if (action === "trash") {
        await onTrash(item.id);
      } else {
        await onPermanentDelete(item.id);
      }
      onClose();
    } catch {
      // The workspace exposes the canonical API error in the page notice.
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Modal
      isOpen={item !== null}
      onClose={onClose}
      title={
        permanentOnly ? t("delete.permanentTitle") : t("delete.dialogTitle")
      }
      size="sm"
      closeOnOverlayClick={!isLoading && pendingAction === null}
      closeOnEsc={!isLoading && pendingAction === null}
    >
      {permanentOnly ? (
        <div className="space-y-4">
          <div className="cloud-delete-choice cloud-delete-choice--danger">
            <XCircle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <h3>{t("delete.permanent")}</h3>
              <p>{t("delete.permanentDescription")}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading || pendingAction !== null}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={pendingAction === "delete"}
              disabled={isLoading}
              onClick={() => void runAction("delete")}
            >
              {t("delete.permanent")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            className="cloud-delete-choice"
            disabled={isLoading || pendingAction !== null}
            onClick={() => void runAction("trash")}
          >
            <Trash2 className="h-5 w-5 shrink-0 text-[#1565C0]" aria-hidden />
            <div>
              <h3>{t("delete.moveToTrash")}</h3>
              <p>{t("delete.moveToTrashDescription")}</p>
              <span>
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {t("delete.retention")}
              </span>
            </div>
          </button>
          <button
            type="button"
            className="cloud-delete-choice cloud-delete-choice--danger"
            disabled={isLoading || pendingAction !== null}
            onClick={() => void runAction("delete")}
          >
            <XCircle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <h3>{t("delete.permanent")}</h3>
              <p>{t("delete.permanentDescription")}</p>
            </div>
          </button>
          <div className="flex justify-end pt-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading || pendingAction !== null}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
