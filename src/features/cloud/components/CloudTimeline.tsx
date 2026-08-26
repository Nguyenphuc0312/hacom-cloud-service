import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon as LoaderCircle,
  ArrowTopRightOnSquareIcon as ExternalLink,
  DocumentDuplicateIcon as Files,
} from "@heroicons/react/24/outline";
import { Button } from "../../../components/ui";
import type { CloudItem } from "../types";
import {
  formatBytes,
  formatCloudTime,
  getCloudItemPreview,
  getCloudItemTitle,
  isSafeExternalUrl,
} from "../utils/cloudFormat";
import { CloudItemIcon } from "./CloudItemIcon";

interface CloudTimelineProps {
  items: CloudItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

interface TimelineGroup {
  key: string;
  label: string;
  items: CloudItem[];
}

const statusTone: Record<CloudItem["status"], string> = {
  ready: "cloud-status--ready",
  processing: "cloud-status--processing",
  pending: "cloud-status--pending",
  failed: "cloud-status--failed",
  trashed: "cloud-status--muted",
  deleting: "cloud-status--muted",
  deleted: "cloud-status--muted",
};

const TimelineSkeleton = () => (
  <div className="space-y-3 px-5 py-4" aria-hidden="true">
    {Array.from({ length: 5 }, (_, index) => (
      <div key={index} className="cloud-timeline-skeleton">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-surface-active" />
        <div className="min-w-0 flex-1 space-y-2">
          <span className="block h-3.5 w-2/5 rounded bg-surface-active" />
          <span className="block h-3 w-3/5 rounded bg-surface-active" />
        </div>
        <span className="h-3 w-14 rounded bg-surface-active" />
      </div>
    ))}
  </div>
);

export const CloudTimeline: React.FC<CloudTimelineProps> = ({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
}) => {
  const { t, i18n } = useTranslation("cloud");
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN";

  const groups = useMemo<TimelineGroup[]>(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    const map = new Map<string, TimelineGroup>();
    items.forEach((item) => {
      const date = new Date(item.createdAt);
      const key = Number.isNaN(date.getTime())
        ? "unknown"
        : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, {
          key,
          label: Number.isNaN(date.getTime())
            ? t("timeline.unknownDate")
            : formatter.format(date),
          items: [item],
        });
      }
    });
    return Array.from(map.values());
  }, [items, locale, t]);

  if (isLoading) return <TimelineSkeleton />;

  if (items.length === 0) {
    return (
      <div className="cloud-empty-state">
        <span className="cloud-empty-state__icon">
          <Files className="h-6 w-6" aria-hidden />
        </span>
        <h3>{t("timeline.empty.title")}</h3>
        <p>{t("timeline.empty.description")}</p>
      </div>
    );
  }

  return (
    <div className="cloud-timeline" data-testid="cloud-timeline">
      {groups.map((group) => (
        <section key={group.key} className="cloud-timeline__group">
          <div className="cloud-timeline__date">
            <span>{group.label}</span>
            <span className="cloud-timeline__date-line" />
          </div>
          <div className="cloud-timeline__rows">
            {group.items.map((item) => {
              const title = getCloudItemTitle(item, {
                text: t("item.untitledText"),
                link: t("item.untitledLink"),
                file: t("item.untitledFile"),
              });
              const preview = getCloudItemPreview(item);
              const isText = item.type === "text";
              return (
                <article
                  key={item.id}
                  className={clsx(
                    "cloud-timeline-row",
                    `cloud-timeline-row--${item.type}`,
                  )}
                >
                  {!isText ? <CloudItemIcon type={item.type} /> : null}
                  <span className="cloud-timeline-row__content">
                    <span className="cloud-timeline-row__heading">
                      {item.type === "link" &&
                      item.url &&
                      isSafeExternalUrl(item.url) ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-primary hover:underline"
                        >
                          <span className="truncate">{title}</span>
                          <ExternalLink
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden
                          />
                        </a>
                      ) : (
                        <span
                          className={clsx(
                            "min-w-0 truncate text-sm text-text-primary",
                            isText ? "font-normal" : "font-semibold",
                          )}
                          title={isText ? preview || title : title}
                        >
                          {isText ? preview || title : title}
                        </span>
                      )}
                    </span>
                    {!isText ? (
                      <span className="cloud-timeline-row__preview">
                        {preview ||
                          t("item.fileMetadata", {
                            size: formatBytes(item.sizeBytes),
                          })}
                      </span>
                    ) : null}
                    <span className="cloud-timeline-row__meta">
                      <span>{formatCloudTime(item.createdAt, locale)}</span>
                      {!isText && item.sizeBytes > 0 ? (
                        <span>{formatBytes(item.sizeBytes)}</span>
                      ) : null}
                      {item.status !== "ready" ? (
                        <span
                          className={clsx(
                            "cloud-status",
                            statusTone[item.status],
                          )}
                        >
                          {item.status === "processing" ? (
                            <LoaderCircle
                              className="h-3 w-3 animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          {t(`status.${item.status}`)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {hasMore ? (
        <div className="flex justify-center py-5">
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
    </div>
  );
};
