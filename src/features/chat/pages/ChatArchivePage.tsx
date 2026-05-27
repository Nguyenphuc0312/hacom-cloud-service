import React from "react";
import clsx from "clsx";
import {
  DocumentTextIcon,
  LinkIcon,
  MusicalNoteIcon,
  PhotoIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

interface ChatArchivePageProps {
  conversationName: string;
  memberCount?: number;
  mediaSizeLabel?: string;
  className?: string;
}

const tabs = [
  { id: "media", label: "Ảnh & Video", icon: PhotoIcon },
  { id: "files", label: "Tệp tin", icon: DocumentTextIcon },
  { id: "links", label: "Đường dẫn", icon: LinkIcon },
  { id: "senders", label: "Người gửi", icon: UserCircleIcon },
  { id: "audio", label: "Âm thanh", icon: MusicalNoteIcon },
];

const mediaItems = Array.from({ length: 12 }, (_, index) => ({
  id: `media-${index}`,
  label: `Tệp media ${index + 1}`,
  tone: index % 4,
}));

export const ChatArchivePage: React.FC<ChatArchivePageProps> = ({
  conversationName,
  memberCount = 0,
  mediaSizeLabel = "1.2 GB Media",
  className,
}) => {
  const [activeTab, setActiveTab] = React.useState("media");

  return (
    <section className={clsx("flex h-full min-h-0 flex-col bg-[var(--hc-bg-page)]", className)}>
      <header className="flex min-h-[var(--hc-header-height)] items-center justify-between gap-4 border-b border-border bg-surface px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-text-primary">
            Kho lưu trữ - {conversationName}
          </h1>
          <p className="text-xs text-text-muted">
            {memberCount.toLocaleString("vi-VN")} thành viên · {mediaSizeLabel}
          </p>
        </div>
      </header>

      <div className="border-b border-border bg-surface px-6">
        <div className="flex gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                  isActive
                    ? "bg-[#1976D2]/10 text-[#1565C0]"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-5xl space-y-6">
          <ArchiveMonth title="Tháng này" />
          <ArchiveMonth title="Tháng 9, 2023" muted />
        </div>
      </div>
    </section>
  );
};

const ArchiveMonth: React.FC<{ title: string; muted?: boolean }> = ({
  title,
  muted = false,
}) => (
  <section>
    <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {mediaItems.slice(0, muted ? 8 : 12).map((item) => (
        <div
          key={`${title}-${item.id}`}
          className={clsx(
            "aspect-square overflow-hidden rounded-md border border-border bg-surface shadow-xs",
            muted && "opacity-80",
          )}
          title={item.label}
        >
          <div
            className={clsx(
              "flex h-full w-full items-end p-3 text-xs font-medium text-white",
              item.tone === 0 && "bg-sky-600",
              item.tone === 1 && "bg-emerald-600",
              item.tone === 2 && "bg-slate-700",
              item.tone === 3 && "bg-indigo-600",
            )}
          >
            <span className="truncate">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default ChatArchivePage;
