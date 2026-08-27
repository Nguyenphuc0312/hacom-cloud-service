import React, { useMemo } from "react";
import {
  ArrowRightIcon as ArrowRight,
  FolderOpenIcon as FolderOpen,
  XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { CloudItem, CloudQuota } from "../types";
import { formatBytes, normalizeCloudItemType } from "../utils/cloudFormat";
import { CloudConversationAvatar } from "./CloudConversationEntry";
import { CloudResourcesPreview } from "./CloudResourcesPreview";

interface CloudConversationInfoPanelProps {
  items: CloudItem[];
  trashItems: CloudItem[];
  quota: CloudQuota | null;
  onLoadAllTrash?: () => Promise<void>;
  onClose: () => void;
  onManageCloud?: () => void;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  onPermanentDeleteItem?: (itemId: string) => void | Promise<void>;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
  /** Display name used by resource rows, matching Hacom Chat. */
  senderName?: string;
  /** Owner id used to resolve short-lived media URLs for thumbnails. */
  userId?: string;
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
> = ({ items, trashItems, quota, onLoadAllTrash, onClose, onManageCloud, onRestoreTrashItem, onPermanentDeleteItem, onDeleteItem, onViewOriginalMessage, onShowInFolder, senderName, userId, showStorage = true }) => {
  const { i18n } = useTranslation("cloud");
  const isVietnamese = i18n.resolvedLanguage !== "en";
  const labels = isVietnamese
    ? {
        title: "Thông tin Hacom Cloud",
        close: "Đóng",
        workspace: "My Documents",
        all: "Tất cả",
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
        title: "Hacom Cloud info",
        close: "Close",
        workspace: "My Documents",
        all: "All",
        trash: "Trash",
        description:
          "Store and quickly access your important content on Hacom Cloud",
        storage: "Storage",
        image: "Photos",
        video: "Videos",
        file: "Files",
        manage: "View and manage Hacom Cloud",
      };

  const normalizedItems = useMemo(() => items.map(normalizeCloudItemType), [items]);

  // Keep the storage breakdown aligned with the dedicated Manage Cloud view.
  // Links, trash and free capacity are intentionally not shown as media
  // segments here; the gray track represents the remaining capacity.
  const categories = useMemo(
    () => [
      {
        key: "image",
        label: labels.image,
        color: "#F97316",
        bytes: typeBytes(normalizedItems, ["image"]),
        showLegend: true,
      },
      {
        key: "video",
        label: labels.video,
        color: "#2F9E5B",
        bytes: typeBytes(normalizedItems, ["video"]),
        showLegend: true,
      },
      {
        key: "file",
        label: labels.file,
        color: "#FFC727",
        bytes: typeBytes(normalizedItems, ["file"]),
        showLegend: true,
      },
      {
        key: "audio",
        label: isVietnamese ? "Tin nhắn thoại" : "Voice messages",
        color: "#4D83BE",
        bytes: typeBytes(normalizedItems, ["audio"]),
        showLegend: true,
      },
      {
        key: "link",
        label: "Link",
        color: "#4F7DD9",
        bytes: typeBytes(normalizedItems, ["link"]),
        showLegend: false,
      },
    ],
    [isVietnamese, normalizedItems, labels.file, labels.image, labels.video],
  );

  const quotaCategories = categories.filter((category) => category.showLegend);
  const limitBytes = quota?.limitBytes ?? 0;
  const percent = (bytes: number): number =>
    limitBytes > 0 ? Math.min(100, Math.max(0, (bytes / limitBytes) * 100)) : 0;

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-[hsl(var(--chat-panel-bg))]"
      aria-label={labels.title}
    >
      <header className="app-page-header flex min-h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <h2 className="min-w-0 truncate text-title-sm text-text-primary">{labels.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="icon-button-surface h-9 w-9"
          aria-label={labels.close}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[hsl(var(--chat-panel-bg))]" style={{ scrollbarGutter: "stable" }}>
        <section className="bg-surface px-5 pb-5 pt-6 text-center">
          <CloudConversationAvatar size="xl" />
          <h3 className="mt-4 text-base font-bold text-text-primary">{labels.workspace}</h3>
          <p className="mx-auto mt-1 max-w-[18rem] text-[15px] leading-6 text-text-muted">{labels.description}</p>
        </section>

        <div>
        <div className="h-2.5 bg-[#eef0f4]" />
        {showStorage ? (
          <div className="px-5 py-4">
          <section className="mx-auto w-full max-w-[428px] rounded-2xl border border-[#E1E6ED] bg-[#F5F7FA] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold leading-6 text-text-primary">{labels.storage}</h3>
            <span className="shrink-0 text-base font-semibold leading-6 text-[#0B1730]">
              {formatBytes(quota?.usedBytes ?? 0)} / {formatBytes(limitBytes)}
            </span>
          </div>
          <div
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[#B9C1CC]"
            role="img"
            aria-label={`${labels.storage}: ${formatBytes(quota?.usedBytes ?? 0)} / ${formatBytes(limitBytes)}`}
          >
            {quotaCategories.map((category) => {
              const width = percent(category.bytes);
              return width > 0 ? (
                <span
                  key={category.key}
                  className="block h-full shrink-0 border-r border-[#F5F7FA] last:border-r-0"
                  style={{ width: `${width}%`, minWidth: "4px", backgroundColor: category.color }}
                  aria-hidden
                />
              ) : null;
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-[#64748B]">
            {quotaCategories.map((category) => (
              <span key={category.key} className="inline-flex items-center gap-2 whitespace-nowrap">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                {category.label}
              </span>
            ))}
          </div>
          </section>
          {onManageCloud ? (
            <button
              type="button"
              onClick={onManageCloud}
              className="mx-auto mt-3 flex h-12 w-full max-w-[428px] items-center gap-3 rounded-xl border border-brand-solid/25 bg-brand-soft/50 px-4 text-left text-base font-medium text-brand-solid transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <FolderOpen className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{labels.manage}</span>
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          ) : null}
          </div>
        ) : null}

        <div className="h-2.5 bg-[#eef0f4]" />
        <section className="bg-surface">
        <CloudResourcesPreview
          items={items}
          trashItems={trashItems}
          onLoadAllTrash={onLoadAllTrash}
          onRestoreTrashItem={onRestoreTrashItem}
          onPermanentDeleteItem={onPermanentDeleteItem}
          onDeleteItem={onDeleteItem}
          onViewOriginalMessage={onViewOriginalMessage}
           onShowInFolder={onShowInFolder}
           userId={userId}
           senderName={senderName}
        />
        </section>
        </div>
      </div>
    </aside>
  );
};
