import React, { useMemo } from "react";
import {
  ArrowRightIcon as ArrowRight,
  FolderOpenIcon as FolderOpen,
  XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Pin } from "lucide-react";
import { useUIStore } from "../../../stores/uiStore";
import { CLOUD_CONVERSATION_ID } from "../constants";
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
  const isPinned = useUIStore((state) =>
    state.pinnedConversationIds.includes(CLOUD_CONVERSATION_ID),
  );
  const togglePinnedConversation = useUIStore(
    (state) => state.togglePinnedConversation,
  );
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

  // Link bytes remain part of the storage bar, but Link and Free are
  // intentionally omitted from the legend per the My Documents UI contract.
  const categories = useMemo(
    () => [
      {
        key: "image",
        label: labels.image,
        color: "#22A06B",
        bytes: typeBytes(normalizedItems, ["image"]),
        showLegend: true,
      },
      {
        key: "video",
        label: labels.video,
        color: "#2F80ED",
        bytes: typeBytes(normalizedItems, ["video"]),
        showLegend: true,
      },
      {
        key: "file",
        label: labels.file,
        color: "#F5B700",
        bytes: typeBytes(normalizedItems, ["file"]),
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
    [normalizedItems, labels.file, labels.image, labels.video],
  );

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

        <section className="bg-surface px-5 pb-5">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => togglePinnedConversation(CLOUD_CONVERSATION_ID)}
              className="group flex min-w-0 flex-col items-center gap-2 px-0.5 py-1 text-center transition-colors disabled:opacity-60"
              aria-label={isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
            >
              <span className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${isPinned ? "bg-[#e8ebf0]" : "bg-[#eef1f5] group-hover:bg-[#e4e8ef]"}`}>
                <Pin className={isPinned ? "h-5 w-5 text-text-secondary" : "h-5 w-5 text-primary"} strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-h-[32px] max-w-[88px] text-center text-[13px] font-medium leading-4 text-text-secondary">
                {isPinned ? "Bỏ ghim" : "Ghim hội thoại"}
              </span>
            </button>
          </div>
        </section>

        <div>
        <div className="h-2.5 bg-[#eef0f4]" />
        {showStorage ? <section className="bg-surface px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-text-primary">{labels.storage}</h3>
            <span className="text-[13px] text-text-muted">
              {limitBytes > 0 ? `${((Number(quota?.usedBytes ?? 0) / limitBytes) * 100).toFixed(Number(quota?.usedBytes ?? 0) > 0 && Number(quota?.usedBytes ?? 0) / limitBytes < 0.1 ? 1 : 0)}%` : "0%"}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">
            {formatBytes(quota?.usedBytes ?? 0)} <span className="text-[15px] font-normal text-text-muted">đã dùng</span>
          </p>
          <p className="text-[13px] text-text-muted">trên tổng dung lượng {formatBytes(limitBytes)}</p>
          <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-hover" aria-label={labels.storage}>
            {categories.map((category) => (
              <span key={category.key} style={{ width: `${percent(category.bytes)}%`, backgroundColor: category.color }} aria-hidden />
            ))}
            <span className="bg-[#F97316]" style={{ width: `${percent(quota?.trashBytes ?? 0)}%` }} aria-hidden />
            <span className="bg-[#B8BEC9]" style={{ width: `${percent(quota?.availableBytes ?? 0)}%` }} aria-hidden />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[15px] text-text-muted">
            {categories.filter((category) => category.showLegend).map((category) => (
              <span key={category.key} className="flex items-center gap-1.5">
                <i className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                {category.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <i className="h-3 w-3 rounded-full bg-[#F97316]" />
              {labels.trash}
            </span>
          </div>
          <p className="mt-2 text-[15px] text-text-muted">Còn trống {formatBytes(quota?.availableBytes ?? 0)}</p>
          {onManageCloud ? (
            <button
              type="button"
              onClick={onManageCloud}
              className="mt-4 flex h-12 w-full items-center gap-2 rounded-lg border border-brand-solid/25 bg-brand-soft/50 px-3 text-left text-[15px] font-medium text-brand-solid transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <FolderOpen className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{labels.manage}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          ) : null}
        </section> : null}

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
