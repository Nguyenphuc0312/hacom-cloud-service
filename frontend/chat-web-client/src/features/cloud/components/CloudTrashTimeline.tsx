import React, { useEffect, useState } from "react";
import { Clock3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui";
import { ConversationLane } from "../../../components/layout/ConversationLane";
import type { CloudItem } from "../types";
import {
  formatBytes,
  getCloudItemPreview,
  getCloudItemTitle,
  getTrashCountdown,
} from "../utils/cloudFormat";
import { CloudItemIcon } from "./CloudItemIcon";

interface CloudTrashTimelineProps {
  items: CloudItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isMutating: boolean;
  onRestore: (itemId: string) => Promise<void>;
  onDelete: (item: CloudItem) => void;
  onLoadMore: () => void;
}

export const CloudTrashTimeline: React.FC<CloudTrashTimelineProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  isMutating,
  onRestore,
  onDelete,
  onLoadMore,
}) => {
  const { t } = useTranslation("cloud");
  const [now, setNow] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const initialTimeoutId = window.setTimeout(() => setNow(Date.now()), 0);
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-muted">
        {t("trash.loading")}
      </div>
    );
  }

  return (
    <div className="cloud-trash-timeline">
      <ConversationLane className="space-y-3 py-5">
        {items.length === 0 ? (
          <div className="cloud-trash-empty">
            <Trash2 className="h-7 w-7" aria-hidden />
            <h2>{t("trash.emptyTitle")}</h2>
            <p>{t("trash.emptyDescription")}</p>
          </div>
        ) : (
          items.map((item) => {
            const title = getCloudItemTitle(item, {
              text: t("item.untitledText"),
              link: t("item.untitledLink"),
              file: t("item.untitledFile"),
            });
            const preview = getCloudItemPreview(item);
            const countdown = getTrashCountdown(item.purgeAfter, now);
            const remaining = countdown.expired
              ? t("trash.expired")
              : countdown.hours > 0
                ? t("trash.hoursRemaining", {
                    count: countdown.hours,
                  })
                : t("trash.minutesRemaining", {
                    count: countdown.minutes,
                  });
            const isMenuOpen = openMenuId === item.id;
            return (
              <article key={item.id} className="cloud-trash-message">
                <div className="cloud-trash-message__bubble">
                  <div className="cloud-trash-message__body">
                    <CloudItemIcon type={item.type} />
                    <div className="min-w-0 flex-1">
                      <h3>{title}</h3>
                      {preview ? <p>{preview}</p> : null}
                      <div className="cloud-trash-message__meta">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>
                          <Clock3 className="h-3.5 w-3.5" aria-hidden />
                          {remaining}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="cloud-trash-message__time">
                    {item.deletedAt ? new Date(item.deletedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null}
                  </div>
                </div>
                <div className="cloud-trash-message__controls">
                  <button
                    type="button"
                    className="cloud-trash-message__restore"
                    aria-label={t("trash.restore")}
                    title={t("trash.restore")}
                    disabled={isMutating || countdown.expired}
                    onClick={() => {
                      void onRestore(item.id).catch(() => undefined);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </button>
                  <div className="cloud-trash-message__menu-wrap">
                    <button
                      type="button"
                      className="cloud-trash-message__more"
                      aria-label={t("trash.deletePermanently")}
                      aria-expanded={isMenuOpen}
                      title={t("trash.deletePermanently")}
                      disabled={isMutating}
                      onClick={() => setOpenMenuId(isMenuOpen ? null : item.id)}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {isMenuOpen ? (
                      <div className="cloud-trash-message__menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="cloud-trash-message__menu-item"
                          onClick={() => {
                            setOpenMenuId(null);
                            onDelete(item);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          {t("trash.deletePermanently")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
        {hasMore ? (
          <div className="flex justify-center pt-2">
            <Button
              size="sm"
              variant="secondary"
              isLoading={isLoadingMore}
              onClick={onLoadMore}
            >
              {t("timeline.loadMore")}
            </Button>
          </div>
        ) : null}
      </ConversationLane>
    </div>
  );
};
