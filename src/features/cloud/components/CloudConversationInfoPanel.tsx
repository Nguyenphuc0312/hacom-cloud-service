import React from "react";
import clsx from "clsx";
import { CirclePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  onClose,
}) => {
  const { i18n } = useTranslation("cloud");
  const isVietnamese = i18n.resolvedLanguage !== "en";
  const labels = isVietnamese
    ? {
        title: "Thông tin hội thoại",
        close: "Đóng",
        workspace: "My Documents",
        all: "Tất cả",
        trash: "Thùng rác",
        description:
          "Lưu trữ và truy cập nhanh những nội dung quan trọng của bạn trên Hacom Cloud",
        storage: "Dung lượng lưu trữ",
        active: "Đang sử dụng",
        free: "Trống",
        requestQuota: "Yêu cầu cấp thêm dung lượng",
        quotaPending: "Yêu cầu tăng quota đang chờ duyệt",
      }
    : {
        title: "Conversation information",
        close: "Close",
        workspace: "My Documents",
        all: "All",
        trash: "Trash",
        description:
          "Store and quickly access your important content on Hacom Cloud",
        storage: "Storage",
        active: "In use",
        free: "Free",
        requestQuota: "Request more storage",
        quotaPending: "Quota request is pending",
      };

  const limitBytes = quota?.limitBytes ?? 0;
  const percent = (bytes: number): number =>
    limitBytes > 0 ? Math.min(100, Math.max(0, (bytes / limitBytes) * 100)) : 0;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface" aria-label={labels.title}>
      <header className="flex min-h-[var(--app-header-height)] items-center justify-between border-b border-border/70 px-5">
        <h2 className="text-[16px] font-semibold text-text-primary">
          {labels.title}
        </h2>
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
          <h3 className="mt-4 text-[18px] font-semibold text-text-primary">
            {labels.workspace}
          </h3>
          <p className="mt-2 max-w-[19rem] text-[13px] leading-5 text-text-muted">
            {labels.description}
          </p>
        </section>

        <section className="border-b border-border/60 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {labels.storage}
            </h3>
            <span className="text-[12px] font-semibold text-text-primary">
              {formatBytes(quota?.usedBytes ?? 0)} / {formatBytes(limitBytes)}
            </span>
          </div>
          <div
            className="mt-3 flex h-4 overflow-hidden rounded-sm bg-surface-muted"
            aria-label={labels.storage}
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
              className="bg-[#B8BEC9]"
              style={{ width: `${percent(quota?.availableBytes ?? 0)}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#22A06B]" />
              {labels.active} · {formatBytes(quota?.activeBytes ?? 0)}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#F97316]" />
              {labels.trash}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#B8BEC9]" />
              {labels.free} · {formatBytes(quota?.availableBytes ?? 0)}
            </span>
          </div>
          {showQuotaRequest ? (
            <div className="mt-4 rounded-xl border border-brand-solid/20 bg-brand-soft/50 p-3">
              <p className="text-xs leading-5 text-text-secondary">
                {quotaRequest?.status === "pending"
                  ? labels.quotaPending
                  : labels.requestQuota}
              </p>
              {quotaRequest?.status !== "pending" ? (
                <button
                  type="button"
                  onClick={onRequestQuota}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-solid hover:underline"
                >
                  <CirclePlus className="h-4 w-4" aria-hidden />
                  {labels.requestQuota}
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
              {labels.all} · {items.length}
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
              {labels.trash} · {trashItems.length}
            </button>
          </div>
        </section>

        <section className="border-b border-border/60 p-4">
          <CloudResourcesPreview
            items={items}
            userId={userId}
            senderName={currentUser?.displayName}
            senderAvatar={currentUser?.avatar}
          />
        </section>
      </div>
    </aside>
  );
};
