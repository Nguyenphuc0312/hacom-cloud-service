import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FileText, ImageIcon, Link2, Play } from "lucide-react";
import { ImagePreviewModal } from "../../../components/modals/ImagePreviewModal";
import { VideoPlayerModal } from "../../../components/info/shared-resources/VideoPlayerModal";
import type { CloudItem } from "../types";
import { formatBytes, getCloudItemTitle } from "../utils/cloudFormat";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";

type ResourceTab = "media" | "files" | "links";
const ACCESS_REQUEST_CONCURRENCY = 4;

interface CloudResourcesPreviewProps {
  items: CloudItem[];
  userId?: string;
  senderName?: string;
  senderAvatar?: string;
}

const itemTitle = (item: CloudItem): string =>
  getCloudItemTitle(item, {
    text: "Nội dung",
    link: "Liên kết",
    file: "Tệp",
  });

export const CloudResourcesPreview: React.FC<CloudResourcesPreviewProps> = ({
  items,
  userId,
  senderName,
  senderAvatar,
}) => {
  const [activeTab, setActiveTab] = useState<ResourceTab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [video, setVideo] = useState<CloudItem | null>(null);
  const [accessById, setAccessById] = useState<
    Record<string, { url: string; expiresAt: string }>
  >({});

  const resolvedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        accessUrl: accessById[item.id]?.url ?? item.accessUrl,
      })),
    [accessById, items],
  );

  const media = useMemo(
    () =>
      resolvedItems.filter(
        (item) => item.type === "image" || item.type === "video",
      ),
    [resolvedItems],
  );
  const files = useMemo(
    () => resolvedItems.filter((item) => item.type === "file"),
    [resolvedItems],
  );
  const links = useMemo(
    () => resolvedItems.filter((item) => item.type === "link"),
    [resolvedItems],
  );
  const images = useMemo(
    () =>
      media
        .filter((item) => item.type === "image" && item.accessUrl)
        .map((item) => ({
          url: item.accessUrl!,
          alt: itemTitle(item),
          fileName: itemTitle(item),
          senderName,
          senderAvatar,
          sentAt: item.createdAt,
          groupKey: item.id,
        })),
    [media, senderAvatar, senderName],
  );

  useEffect(() => {
    if (!userId) return;
    const sourceItems =
      activeTab === "media" ? media : activeTab === "files" ? files : [];
    const candidates = sourceItems.filter((item) => {
      if (item.status !== "ready") return false;
      const expiresAt = accessById[item.id]?.expiresAt ?? item.accessExpiresAt;
      return !expiresAt || Date.parse(expiresAt) - Date.now() <= 30_000;
    });
    if (candidates.length === 0) return;
    let cancelled = false;
    const entries: Array<
      readonly [string, { url: string; expiresAt: string }] | null
    > = Array.from({ length: candidates.length }, () => null);
    let nextIndex = 0;
    const hydrateNext = async (): Promise<void> => {
      while (nextIndex < candidates.length && !cancelled) {
        const index = nextIndex++;
        const item = candidates[index];
        try {
          const access = await getCachedCloudFileAccess(userId, item.id);
          entries[index] = [
            item.id,
            { url: access.url, expiresAt: access.expiresAt },
          ];
        } catch {
          entries[index] = null;
        }
      }
    };
    void Promise.all(
      Array.from(
        {
          length: Math.min(ACCESS_REQUEST_CONCURRENCY, candidates.length),
        },
        () => hydrateNext(),
      ),
    ).then(() => {
      if (cancelled) return;
      const next: Record<string, { url: string; expiresAt: string }> = {};
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      if (Object.keys(next).length > 0) {
        setAccessById((current) => {
          const changed = Object.entries(next).some(
            ([itemId, access]) =>
              current[itemId]?.url !== access.url ||
              current[itemId]?.expiresAt !== access.expiresAt,
          );
          if (!changed) return current;
          return { ...current, ...next };
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessById, activeTab, files, media, userId]);

  const tabs: Array<{ key: ResourceTab; label: string; count: number }> = [
    { key: "media", label: "Ảnh/Video", count: media.length },
    { key: "files", label: "File", count: files.length },
    { key: "links", label: "Link", count: links.length },
  ];

  const openImage = (item: CloudItem) => {
    if (!item.accessUrl) return;
    const index = images.findIndex((image) => image.url === item.accessUrl);
    if (index >= 0) setLightboxIndex(index);
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Kho lưu trữ</h3>
        </div>

        <div className="flex border-t border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "flex min-w-0 flex-1 items-center justify-center gap-1 py-3 text-xs font-medium transition-colors",
                activeTab === tab.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              <span className="truncate">{tab.label}</span>
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  activeTab === tab.key
                    ? "bg-primary/10 text-primary"
                    : "bg-surface-overlay text-text-muted",
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="min-h-28 p-3">
          {activeTab === "media" ? (
            media.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {media.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.accessUrl}
                    onClick={() =>
                      item.type === "video" ? setVideo(item) : openImage(item)
                    }
                    className="group relative aspect-square overflow-hidden rounded-lg bg-surface-overlay disabled:cursor-default"
                    aria-label={itemTitle(item)}
                  >
                    {item.accessUrl ? (
                      item.type === "image" ? (
                        <img
                          src={item.accessUrl}
                          alt={itemTitle(item)}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <video
                          src={item.accessUrl}
                          className="h-full w-full object-cover"
                          muted
                          preload="metadata"
                        />
                      )
                    ) : (
                      <ImageIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-text-muted" />
                    )}
                    {item.type === "video" ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-sm">
                          <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                        </span>
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={<ImageIcon />} label="Chưa có ảnh hoặc video" />
            )
          ) : null}

          {activeTab === "files" ? (
            files.length > 0 ? (
              <div className="space-y-1.5">
                {files.map((item) => {
                  const content = (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-text-muted">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-text-primary">
                          {itemTitle(item)}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {formatBytes(item.sizeBytes)}
                        </span>
                      </span>
                    </>
                  );
                  return item.accessUrl ? (
                    <a
                      key={item.id}
                      href={item.accessUrl}
                      download={itemTitle(item)}
                      className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover"
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg p-2">
                      {content}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<FileText />} label="Chưa có file" />
            )
          ) : null}

          {activeTab === "links" ? (
            links.length > 0 ? (
              <div className="space-y-1.5">
                {links.map((item) => {
                  const url = item.url?.trim() ?? "";
                  let host = url;
                  try {
                    host = new URL(url).hostname.replace(/^www\./, "");
                  } catch {
                    // Keep the original URL as the secondary label.
                  }
                  return (
                    <a
                      key={item.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Link2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-text-primary">
                          {itemTitle(item)}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {host}
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<Link2 />} label="Chưa có liên kết" />
            )
          ) : null}
        </div>
      </div>

      <ImagePreviewModal
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        images={images}
        initialIndex={lightboxIndex ?? 0}
      />
      <VideoPlayerModal
        isOpen={video !== null}
        onClose={() => setVideo(null)}
        url={video?.accessUrl ?? null}
        fileName={video ? itemTitle(video) : undefined}
      />
    </>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactElement<{ className?: string }>;
  label: string;
}> = ({
  icon,
  label,
}) => (
  <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-text-muted">
    {React.cloneElement(icon, { className: "h-7 w-7" })}
    <p className="text-xs">{label}</p>
  </div>
);
