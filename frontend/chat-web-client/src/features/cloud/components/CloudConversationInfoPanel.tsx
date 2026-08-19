import React, { useMemo } from "react";
import {
  ArrowRightIcon as ArrowRight,
  FolderOpenIcon as FolderOpen,
  PlusCircleIcon as CirclePlus,
  XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type {
  CloudItem,
  CloudQuota,
  CloudQuotaRequest,
  CloudViewMode,
} from "../types";
import { formatBytes } from "../utils/cloudFormat";
import { CloudConversationAvatar } from "./CloudConversationEntry";
import { CloudResourcesPreview } from "./CloudResourcesPreview";

interface CloudConversationInfoPanelProps {
  items: CloudItem[];
  trashItems: CloudItem[];
  quota: CloudQuota | null;
  quotaRequest?: CloudQuotaRequest | null;
  showQuotaRequest?: boolean;
  viewMode: CloudViewMode;
  onViewModeChange: (mode: CloudViewMode) => void;
  onRequestQuota?: () => void;
  onLoadAllTrash?: () => Promise<void>;
  onClose: () => void;
  onManageCloud?: () => void;
  isMutating?: boolean;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  onDeleteTrashItem?: (item: CloudItem) => void;
  isLoadingTrash?: boolean;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
  /** Hide quota storage details while the dedicated Trash view is active. */
  showStorage?: boolean;
}

const typeBytes = (items: CloudItem[], types: CloudItem["type"][]): number =>
  items.reduce(
    (total, item) => total + (types.includes(item.type) ? item.sizeBytes : 0),
    0,
  );

export const CloudConversationInfoPanel: React.FC<
  CloudConversationInfoPanelProps
> = ({
  items,
  trashItems,
  quota,
  quotaRequest = null,
  showQuotaRequest = false,
  onViewModeChange,
  onRequestQuota,
  onLoadAllTrash,
  onClose,
  onManageCloud,
  isMutating = false,
  onRestoreTrashItem,
  onDeleteTrashItem,
  isLoadingTrash = false,
  onDeleteItem,
  onViewOriginalMessage,
  onShowInFolder,
  showStorage = true,
}) => {
  const { i18n, t } = useTranslation("cloud");
  const isVietnamese = i18n.resolvedLanguage !== "en";
  const labels = isVietnamese
    ? {
        title: "Thông tin Hacom Cloud",
        close: "Đóng",
        workspace: "My Documents",
        trash: "Thùng rác",
        description:
          "Lưu trữ và truy cập nhanh những nội dung quan trọng của bạn trên Hacom Cloud",
        storage: "Dung lượng lưu trữ",
        image: "Ảnh",
        video: "Video",
        file: "File",
        manage: "Xem và quản lý Hacom Cloud",
      }
    : {
        title: "Hacom Cloud information",
        close: "Close",
        workspace: "My Documents",
        trash: "Trash",
        description:
          "Store and quickly access your important content on Hacom Cloud",
        storage: "Storage",
        image: "Photos",
        video: "Videos",
        file: "Files",
        manage: "View and manage Hacom Cloud",
      };

  const categories = useMemo(
    () => [
      {
        key: "image",
        label: labels.image,
        color: "#22A06B",
        bytes: typeBytes(items, ["image"]),
        showLegend: true,
      },
      {
        key: "video",
        label: labels.video,
        color: "#2F80ED",
        bytes: typeBytes(items, ["video"]),
        showLegend: true,
      },
      {
        key: "file",
        label: labels.file,
        color: "#F5B700",
        bytes: typeBytes(items, ["file"]),
        showLegend: true,
      },
      {
        key: "link",
        label: "Link",
        color: "#4F7DD9",
        bytes: typeBytes(items, ["link"]),
        showLegend: false,
      },
    ],
    [items, labels.file, labels.image, labels.video],
  );

  const limitBytes = quota?.limitBytes ?? 0;
  const percent = (bytes: number): number =>
    limitBytes > 0 ? Math.min(100, Math.max(0, (bytes / limitBytes) * 100)) : 0;

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col bg-surface"
      aria-label={labels.title}
    >
      <header className="flex min-h-[var(--app-header-height)] items-center justify-between border-b border-border/70 px-5">
        <h2 className="text-[16px] font-semibold text-text-primary">{labels.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          aria-label={labels.close}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="flex flex-col items-center border-b border-border/60 px-6 py-7 text-center">
          <CloudConversationAvatar size="lg" />
          <h3 className="mt-4 text-[18px] font-semibold text-text-primary">{labels.workspace}</h3>
          <p className="mt-2 max-w-[19rem] text-[13px] leading-5 text-text-muted">{labels.description}</p>
        </section>

        {showStorage ? (
          <section className="border-b border-border/60 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold text-text-primary">{labels.storage}</h3>
              <span className="text-[12px] font-semibold text-text-primary">
                {formatBytes(quota?.usedBytes ?? 0)} / {formatBytes(limitBytes)}
              </span>
            </div>
            <div
              className="mt-3 flex h-4 overflow-hidden rounded-sm bg-surface-muted"
              aria-label={labels.storage}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={limitBytes}
              aria-valuenow={Math.min(quota?.usedBytes ?? 0, limitBytes)}
            >
              {categories.map((category) => (
                <span
                  key={category.key}
                  style={{ width: `${percent(category.bytes)}%`, backgroundColor: category.color }}
                  aria-hidden
                />
              ))}
              <span className="bg-[#F97316]" style={{ width: `${percent(quota?.trashBytes ?? 0)}%` }} aria-hidden />
              <span className="bg-[#B8BEC9]" style={{ width: `${percent(quota?.availableBytes ?? 0)}%` }} aria-hidden />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-text-muted">
              {categories.filter((category) => category.showLegend).map((category) => (
                <span key={category.key} className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                  {category.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
                {labels.trash}
              </span>
            </div>
            {onManageCloud ? (
              <button
                type="button"
                onClick={onManageCloud}
                className="mt-5 flex w-full items-center gap-3 rounded-full border border-[#9BC5F5] px-4 py-3 text-left text-[15px] font-medium text-[#1565C0] transition-colors hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30"
              >
                <FolderOpen className="h-5 w-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{labels.manage}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            ) : null}
            {showQuotaRequest ? (
              <div className="mt-4 rounded-xl border border-brand-solid/20 bg-brand-soft/40 p-3">
                <p className="text-xs leading-5 text-text-secondary">
                  {quotaRequest?.status === "pending"
                    ? t("quotaRequest.status.pending")
                    : quotaRequest?.status === "approved"
                      ? t("quotaRequest.status.approved")
                      : quotaRequest?.status === "rejected"
                        ? t("quotaRequest.status.rejected")
                        : t("quotaRequest.action")}
                </p>
                {quotaRequest?.status !== "pending" && onRequestQuota ? (
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
        ) : null}

        <div className="px-4 pb-4 pr-5">
          <CloudResourcesPreview
            items={items}
            trashItems={trashItems}
            onViewTrash={() => onViewModeChange("trash")}
            onLoadAllTrash={onLoadAllTrash}
            onRestoreTrashItem={onRestoreTrashItem}
            onDeleteTrashItem={onDeleteTrashItem}
            isMutating={isMutating}
            isLoadingTrash={isLoadingTrash}
            onDeleteItem={onDeleteItem}
            onViewOriginalMessage={onViewOriginalMessage}
            onShowInFolder={onShowInFolder}
          />
        </div>
      </div>
    </aside>
  );
};
