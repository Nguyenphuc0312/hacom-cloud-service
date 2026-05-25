import React, { useState } from "react";
import {
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Skeleton, Input } from "../../ui";
import { InfoMenuRow } from "../InfoMenuRow";
import {
  useGetConversationSidebarSummaryQuery,
  useGetConversationMediaQuery,
  useGetConversationFilesQuery,
  useGetConversationLinksQuery,
} from "../../../features/api/chatApi";
import type {
  ConversationResourcesMediaItem,
  ConversationResourcesFileItem,
  ConversationResourcesLinkItem,
} from "../../../features/api/chatApi";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../message/FileTypeIcon";
import { formatRelativeDate } from "../../../utils/formatTime";
import { fileApi } from "../../../services/api";
import { useDebounce } from "../../../hooks/useDebounce";
import { unwrapApiSuccess } from "../../../lib/apiContract";

interface SharedResourcesPreviewProps {
  conversationId: string;
}

const MEDIA_PAGE_SIZE = 12;
const FILES_PAGE_SIZE = 10;
const LINKS_PAGE_SIZE = 10;

const MEDIA_PREVIEW_SIZE = 6;
const FILES_PREVIEW_SIZE = 4;
const LINKS_PREVIEW_SIZE = 3;

type ResourceKey = "media" | "files" | "links";

function truncateFilename(name: string, maxLength = 24): string {
  if (name.length <= maxLength) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return name.slice(0, maxLength - 3) + "...";
  const ext = name.slice(dotIdx + 1);
  const base = name.slice(0, dotIdx);
  const keepBase = maxLength - ext.length - 3;
  if (keepBase <= 2) return name.slice(0, maxLength - 3) + "...";
  return base.slice(0, keepBase) + "..." + ext;
}

export const SharedResourcesPreview: React.FC<SharedResourcesPreviewProps> = ({
  conversationId,
}) => {
  const [open, setOpen] = useState<Record<ResourceKey, boolean>>({
    media: false,
    files: false,
    links: false,
  });

  const { data, isLoading } = useGetConversationSidebarSummaryQuery(
    conversationId,
    { skip: !conversationId },
  );

  const toggle = (key: ResourceKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const mediaTotal = data?.media.total ?? 0;
  const filesTotal = data?.files.total ?? 0;
  const linksTotal = data?.links.total ?? 0;

  return (
    <>
      <ResourceCard
        icon={<PhotoIcon />}
        label="Ảnh/Video"
        count={mediaTotal}
        open={open.media}
        onToggle={() => toggle("media")}
      >
        <MediaSection conversationId={conversationId} total={mediaTotal} />
      </ResourceCard>

      <ResourceCard
        icon={<DocumentIcon />}
        label="File"
        count={filesTotal}
        open={open.files}
        onToggle={() => toggle("files")}
      >
        <FilesSection conversationId={conversationId} total={filesTotal} />
      </ResourceCard>

      <ResourceCard
        icon={<LinkIcon />}
        label="Link"
        count={linksTotal}
        open={open.links}
        onToggle={() => toggle("links")}
      >
        <LinksSection conversationId={conversationId} total={linksTotal} />
      </ResourceCard>
    </>
  );
};

const ResourceCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ icon, label, count, open, onToggle, children }) => (
  <div className="overflow-hidden rounded-xl border border-border bg-surface">
    <InfoMenuRow
      icon={icon}
      label={label}
      count={count}
      expandable
      expanded={open}
      onClick={onToggle}
    />
    {open && <div className="border-t border-border">{children}</div>}
  </div>
);

const EmptyInline: React.FC<{ icon: React.ReactNode; text: string }> = ({
  icon,
  text,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-8 text-text-muted">
    {icon}
    <p className="text-sm">{text}</p>
  </div>
);

const ViewAllButton: React.FC<{ total: number; onClick: () => void }> = ({
  total,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
  >
    Xem tất cả ({total})
  </button>
);

const CollapseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover"
  >
    Rút gọn
  </button>
);

const Pager: React.FC<{
  page: number;
  hasNext: boolean;
  isFetching: boolean;
  onPrev: () => void;
  onNext: () => void;
}> = ({ page, hasNext, isFetching, onPrev, onNext }) => {
  if (!hasNext && page <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <button
        type="button"
        disabled={page === 1 || isFetching}
        onClick={onPrev}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
      >
        Trước
      </button>
      <span className="text-sm text-text-muted">Trang {page}</span>
      <button
        type="button"
        disabled={!hasNext || isFetching}
        onClick={onNext}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
      >
        Sau
      </button>
    </div>
  );
};

const MediaSection: React.FC<{ conversationId: string; total: number }> = ({
  conversationId,
  total,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);

  const limit = showAll ? MEDIA_PAGE_SIZE : MEDIA_PREVIEW_SIZE;

  const { data, isLoading, isFetching } = useGetConversationMediaQuery({
    conversationId,
    page: showAll ? page : 1,
    limit,
  });

  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 p-3">
        {Array.from({ length: MEDIA_PREVIEW_SIZE }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyInline
        icon={<PhotoIcon className="h-8 w-8" />}
        text="Chưa có ảnh hoặc video nào"
      />
    );
  }

  return (
    <div className="p-3">
      <div className="grid grid-cols-3 gap-1">
        {items.map((item) => (
          <GalleryThumb key={`${item.messageId}-${item.fileId}`} item={item} />
        ))}
      </div>
      {showAll ? (
        <>
          <Pager
            page={page}
            hasNext={hasNext}
            isFetching={isFetching}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
          <CollapseButton
            onClick={() => {
              setShowAll(false);
              setPage(1);
            }}
          />
        </>
      ) : total > MEDIA_PREVIEW_SIZE ? (
        <ViewAllButton total={total} onClick={() => setShowAll(true)} />
      ) : null}
    </div>
  );
};

const GalleryThumb: React.FC<{ item: ConversationResourcesMediaItem }> = ({
  item,
}) => {
  const src = item.thumbnailUrl ?? undefined;
  const isVideo = item.messageType === "video";

  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-surface-overlay">
      {src ? (
        <img
          src={src}
          alt={item.fileName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PhotoIcon className="h-6 w-6 text-text-muted" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80">
            <span className="ml-0.5 border-y-[5px] border-l-[9px] border-r-0 border-y-transparent border-l-text-primary" />
          </div>
        </div>
      )}
    </div>
  );
};

const FilesSection: React.FC<{ conversationId: string; total: number }> = ({
  conversationId,
  total,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const limit = showAll ? FILES_PAGE_SIZE : FILES_PREVIEW_SIZE;

  const { data, isLoading, isFetching } = useGetConversationFilesQuery({
    conversationId,
    page: showAll ? page : 1,
    limit,
    q: debouncedSearch || undefined,
  });

  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setPage(1);
    if (!showAll) setShowAll(true);
  };

  return (
    <div className="p-3">
      <Input
        type="text"
        value={searchInput}
        onChange={handleSearchChange}
        placeholder="Tìm kiếm file..."
        leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
      />

      {isLoading || isFetching ? (
        <div className="mt-2 space-y-1">
          {Array.from({ length: FILES_PREVIEW_SIZE }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyInline
          icon={<DocumentIcon className="h-8 w-8" />}
          text={debouncedSearch ? "Không tìm thấy file phù hợp" : "Chưa có file nào"}
        />
      ) : (
        <>
          <div className="mt-2 space-y-1">
            {items.map((item) => (
              <FileRow
                key={`${item.messageId}-${item.fileId}`}
                item={item}
                conversationId={conversationId}
              />
            ))}
          </div>
          {showAll ? (
            <>
              <Pager
                page={page}
                hasNext={hasNext}
                isFetching={isFetching}
                onPrev={() => setPage((p) => p - 1)}
                onNext={() => setPage((p) => p + 1)}
              />
              {!debouncedSearch && (
                <CollapseButton
                  onClick={() => {
                    setShowAll(false);
                    setPage(1);
                  }}
                />
              )}
            </>
          ) : total > FILES_PREVIEW_SIZE ? (
            <ViewAllButton total={total} onClick={() => setShowAll(true)} />
          ) : null}
        </>
      )}
    </div>
  );
};

const FileRow: React.FC<{
  item: ConversationResourcesFileItem;
  conversationId: string;
}> = ({ item, conversationId }) => {
  const iconType = getFileIconType(item.mimeType, item.fileName);
  const date = formatRelativeDate(new Date(item.createdAt));
  const [isDownloading, setIsDownloading] = useState(false);

  const displayName = truncateFilename(item.fileName);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fileApi.getDownloadUrl({
        conversationId,
        attachmentId: item.fileId,
      });
      const payload = unwrapApiSuccess(res);
      if (payload.url) {
        const a = document.createElement("a");
        a.href = payload.url;
        a.download = item.fileName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      title={item.fileName}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover disabled:opacity-60"
    >
      <div className="shrink-0">
        <FileTypeIcon type={iconType} className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">
          {displayName}
        </p>
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {item.senderName} · {date}
        </p>
      </div>
    </button>
  );
};

const LinksSection: React.FC<{ conversationId: string; total: number }> = ({
  conversationId,
  total,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);

  const limit = showAll ? LINKS_PAGE_SIZE : LINKS_PREVIEW_SIZE;

  const { data, isLoading, isFetching } = useGetConversationLinksQuery({
    conversationId,
    page: showAll ? page : 1,
    limit,
  });

  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  if (isLoading || isFetching) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: LINKS_PREVIEW_SIZE }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyInline
        icon={<LinkIcon className="h-8 w-8" />}
        text="Chưa có link nào được chia sẻ"
      />
    );
  }

  return (
    <div className="p-3">
      <div className="space-y-1">
        {items.map((item) => (
          <LinkRow key={item.messageId} item={item} />
        ))}
      </div>
      {showAll ? (
        <>
          <Pager
            page={page}
            hasNext={hasNext}
            isFetching={isFetching}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
          <CollapseButton
            onClick={() => {
              setShowAll(false);
              setPage(1);
            }}
          />
        </>
      ) : total > LINKS_PREVIEW_SIZE ? (
        <ViewAllButton total={total} onClick={() => setShowAll(true)} />
      ) : null}
    </div>
  );
};

const LinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({
  item,
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover"
    >
      <div className="shrink-0 rounded-md bg-primary/10 p-2">
        <LinkIcon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {item.domain}
        </p>
        <p className="truncate text-xs text-primary">{item.url}</p>
        <p className="truncate text-xs text-text-muted">
          {item.senderName} · {date}
        </p>
      </div>
    </a>
  );
};
