import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  Clock3,
  FileText,
  FolderOpen,
  HardDrive,
  Image,
  Link2,
  LoaderCircle,
  Music2,
  Search,
  Share2,
  StickyNote,
  Trash2,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Input } from "../../../components/ui";
import type {
  CloudFilter,
  CloudHealth,
  CloudItem,
  CloudQuota,
} from "../types";
import { formatBytes } from "../utils/cloudFormat";

interface CloudSidebarProps {
  filter: CloudFilter;
  onFilterChange: (filter: CloudFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  items: CloudItem[];
  quota: CloudQuota | null;
  health: CloudHealth | null;
}

const filterIcons = {
  all: Clock3,
  text: StickyNote,
  image: Image,
  video: Video,
  audio: Music2,
  file: FileText,
  link: Link2,
} satisfies Record<CloudFilter, React.ComponentType<{ className?: string }>>;

export const CloudSidebar: React.FC<CloudSidebarProps> = ({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  items,
  quota,
  health,
}) => {
  const { t } = useTranslation("cloud");
  const usedPercent = quota
    ? Math.min(100, ((quota.usedBytes + quota.reservedBytes) / quota.limitBytes) * 100)
    : 0;
  const countByFilter: Record<CloudFilter, number> = {
    all: items.length,
    text: items.filter((item) => item.type === "text").length,
    image: items.filter((item) => item.type === "image").length,
    video: items.filter((item) => item.type === "video").length,
    audio: items.filter((item) => item.type === "audio").length,
    file: items.filter((item) => item.type === "file").length,
    link: items.filter((item) => item.type === "link").length,
  };

  return (
    <aside className="cloud-sidebar">
      <div className="cloud-sidebar__header">
        <div className="flex min-w-0 items-center gap-3">
          <div className="cloud-sidebar__brand-mark">
            <HardDrive className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-text-primary">
              {t("title")}
            </h1>
            <p className="truncate text-xs text-text-muted">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-4">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.aria")}
          leftIcon={<Search className="h-4 w-4" />}
          className="!h-9"
        />
      </div>

      <nav className="cloud-sidebar__nav" aria-label={t("navigation.aria")}>
        {(Object.keys(filterIcons) as CloudFilter[]).map((key) => {
          const Icon = filterIcons[key];
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={clsx(
                "cloud-sidebar__nav-item",
                active && "cloud-sidebar__nav-item--active",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">
                {t(`navigation.${key}`)}
              </span>
              <span className="cloud-sidebar__count">{countByFilter[key]}</span>
            </button>
          );
        })}

        <div className="cloud-sidebar__divider" />
        <button type="button" className="cloud-sidebar__nav-item" disabled>
          <FolderOpen className="h-[18px] w-[18px]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            {t("navigation.folders")}
          </span>
          <span className="cloud-sidebar__soon">{t("common.soon")}</span>
        </button>
        <button type="button" className="cloud-sidebar__nav-item" disabled>
          <Share2 className="h-[18px] w-[18px]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            {t("navigation.shared")}
          </span>
          <span className="cloud-sidebar__soon">{t("common.soon")}</span>
        </button>
        <button type="button" className="cloud-sidebar__nav-item" disabled>
          <Trash2 className="h-[18px] w-[18px]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            {t("navigation.trash")}
          </span>
          <span className="cloud-sidebar__soon">{t("common.soon")}</span>
        </button>
      </nav>

      <div className="mt-auto space-y-3 p-3">
        <section className="cloud-quota-card" aria-label={t("quota.aria")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-xs font-semibold text-text-primary">
                {t("quota.title")}
              </span>
            </div>
            <span className="text-[11px] font-medium text-text-muted">
              {quota ? `${usedPercent.toFixed(usedPercent < 1 ? 1 : 0)}%` : "?"}
            </span>
          </div>
          <div className="cloud-quota-card__track" aria-hidden="true">
            <span style={{ width: `${usedPercent}%` }} />
          </div>
          <p className="text-[11px] leading-4 text-text-secondary">
            {quota
              ? t("quota.usage", {
                  used: formatBytes(quota.usedBytes),
                  limit: formatBytes(quota.limitBytes),
                })
              : t("quota.loading")}
          </p>
          {quota && quota.reservedBytes > 0 ? (
            <p className="mt-1 text-[11px] text-warning">
              {t("quota.reserved", {
                value: formatBytes(quota.reservedBytes),
              })}
            </p>
          ) : null}
        </section>

        <div className="cloud-service-state" role="status">
          {health === null ? (
            <LoaderCircle
              className="h-3.5 w-3.5 animate-spin text-text-muted"
              aria-hidden
            />
          ) : health.status === "UP" ? (
            <Wifi className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-danger" aria-hidden />
          )}
          <span>
            {t(
              health === null
                ? "service.checking"
                : health.status === "UP"
                  ? "service.ready"
                  : "service.offline",
            )}
          </span>
        </div>
      </div>
    </aside>
  );
};
