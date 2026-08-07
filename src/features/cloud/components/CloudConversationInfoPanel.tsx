import React, { useState } from "react";
import clsx from "clsx";
import { CirclePlus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "../../../components/ui";
import type {
  CloudItem,
  CloudQuota,
  CloudQuotaRequest,
  CloudViewMode,
} from "../types";
import type { UserSummary } from "../../../types";
import { formatBytes } from "../utils/cloudFormat";
import { CloudConversationAvatar } from "./CloudConversationEntry";
import { CloudResourcesPreview } from "./CloudResourcesPreview";

interface CloudConversationInfoPanelProps {
  items: CloudItem[];
  trashItems: CloudItem[];
  userId?: string;
  currentUser?: Pick<UserSummary, "displayName" | "avatar">;
  quota: CloudQuota | null;
  quotaRequest: CloudQuotaRequest | null;
  showQuotaRequest: boolean;
  viewMode: CloudViewMode;
  onViewModeChange: (mode: CloudViewMode) => void;
  onRequestQuota: () => void;
  onEmptyTrash?: () => Promise<void>;
  isMutating?: boolean;
  onClose: () => void;
}

export const CloudConversationInfoPanel: React.FC<
  CloudConversationInfoPanelProps
> = ({
  items,
  trashItems,
  userId,
  currentUser,
  quota,
  quotaRequest,
  showQuotaRequest,
  viewMode,
  onViewModeChange,
  onRequestQuota,
  onEmptyTrash,
  isMutating = false,
  onClose,
}) => {
  const { t } = useTranslation("cloud");
  const [isEmptyTrashConfirmOpen, setIsEmptyTrashConfirmOpen] = useState(false);

  const limitBytes = quota?.limitBytes ?? 0;
  const percent = (bytes: number): number =>
    limitBytes > 0 ? Math.min(100, Math.max(0, (bytes / limitBytes) * 100)) : 0;

  const confirmEmptyTrash = async () => {
    if (!onEmptyTrash) return;
    try {
      await onEmptyTrash();
      setIsEmptyTrashConfirmOpen(false);
    } catch {
      // The page keeps the canonical Cloud error visible after a failed mutation.
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface" aria-label={t("inspector.title")}>
      <header className="flex min-h-[var(--app-header-height)] items-center justify-between border-b border-border/70 px-5">
        <h2 className="text-[16px] font-semibold text-text-primary">
          {t("inspector.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="flex flex-col items-center border-b border-border/60 px-6 py-7 text-center">
          <CloudConversationAvatar size="lg" />
          <h3 className="mt-4 text-[18px] font-semibold text-text-primary">
            {t("workspace.title")}
          </h3>
          <p className="mt-2 max-w-[19rem] text-[13px] leading-5 text-text-muted">
            {t("workspace.description")}
          </p>
        </section>

        <section className="border-b border-border/60 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {t("quota.title")}
            </h3>
            <span className="text-[12px] font-semibold text-text-primary">
              {formatBytes(quota?.usedBytes ?? 0)} / {formatBytes(limitBytes)}
            </span>
          </div>
          <div
            className="mt-3 flex h-4 overflow-hidden rounded-sm bg-surface-muted"
            aria-label={t("quota.aria")}
          >
            <span
              className="bg-[#22A06B]"
              style={{ width: `${percent(quota?.activeBytes ?? 0)}%` }}
              aria-hidden
            />
            <span
              className="bg-[#F97316]"
              style={{ width: `${percent(quota?.trashBytes ?? 0)}%` }}
              aria-hidden
            />
            <span
              className="bg-[#8B5CF6]"
              style={{ width: `${percent(quota?.reservedBytes ?? 0)}%` }}
              aria-hidden
            />
            <span
              className="bg-[#B8BEC9]"
              style={{ width: `${percent(quota?.availableBytes ?? 0)}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#22A06B]" />
              {t("quota.active", { value: formatBytes(quota?.activeBytes ?? 0) })}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
              {t("quota.trash", { value: formatBytes(quota?.trashBytes ?? 0) })}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#8B5CF6]" />
              {t("quota.reserved", { value: formatBytes(quota?.reservedBytes ?? 0) })}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#B8BEC9]" />
              {t("quota.available", { value: formatBytes(quota?.availableBytes ?? 0) })}
            </span>
          </div>
          {showQuotaRequest || quotaRequest ? (
            <div className="mt-4 rounded-xl border border-brand-solid/20 bg-brand-soft/50 p-3">
              <p className="text-xs leading-5 text-text-secondary">
                {quotaRequest
                  ? t(`quotaRequest.status.${quotaRequest.status}`)
                  : t("quotaRequest.action")}
              </p>
              {quotaRequest ? (
                <p className="mt-1 text-[11px] text-text-muted">
                  {t("quotaRequest.requested", {
                    value: formatBytes(quotaRequest.requestedQuotaBytes),
                  })}
                </p>
              ) : null}
              {quotaRequest?.status !== "pending" ? (
                <button
                  type="button"
                  onClick={onRequestQuota}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-solid hover:underline"
                >
                  <CirclePlus className="h-4 w-4" aria-hidden />
                  {t("quotaRequest.action")}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="border-b border-border/60 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onViewModeChange("active")}
              className={clsx(
                "rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-fast",
                viewMode === "active"
                  ? "border-brand-solid/30 bg-brand-soft text-brand-solid"
                  : "border-border/70 text-text-secondary hover:bg-surface-hover",
              )}
            >
              {t("navigation.all")} · {items.length}
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("trash")}
              className={clsx(
                "rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-fast",
                viewMode === "trash"
                  ? "border-brand-solid/30 bg-brand-soft text-brand-solid"
                  : "border-border/70 text-text-secondary hover:bg-surface-hover",
              )}
            >
              {t("navigation.trash")} · {trashItems.length}
            </button>
          </div>
        </section>

        <section className="border-b border-border/60 p-4">
          {viewMode === "trash" && trashItems.length > 0 && onEmptyTrash ? (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => setIsEmptyTrashConfirmOpen(true)}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/5"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("trash.emptyAction")}
            </button>
          ) : null}
          <CloudResourcesPreview
            items={viewMode === "trash" ? trashItems : items}
            userId={userId}
            senderName={currentUser?.displayName}
            senderAvatar={currentUser?.avatar}
          />
        </section>
      </div>
      <Modal
        isOpen={isEmptyTrashConfirmOpen}
        onClose={() => setIsEmptyTrashConfirmOpen(false)}
        title={t("trash.emptyAction")}
        description={t("trash.emptyConfirm")}
        size="sm"
        closeOnOverlayClick={!isMutating}
        closeOnEsc={!isMutating}
      >
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isMutating}
            onClick={() => setIsEmptyTrashConfirmOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isMutating}
            disabled={isMutating}
            onClick={() => void confirmEmptyTrash()}
          >
            {t("trash.emptyAction")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
};
