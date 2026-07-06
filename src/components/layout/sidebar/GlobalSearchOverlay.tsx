/**
 * @fileoverview GlobalSearchOverlay — Zalo-style full-panel search that expands
 * over the sidebar when the search box is focused. Tabs: Tất cả / Liên hệ /
 * Tin nhắn / File, with sender+date filters (messages) and type+date (files).
 *
 * The overlay is a presentational shell; all data comes from useGlobalSearch.
 * FE is complete: real sources are wired where an endpoint exists; the two
 * gaps (server-side message sender/date filters, a cross-conversation files
 * endpoint) are marked and covered by the BE contract so wiring them is a
 * drop-in swap inside useGlobalSearch — no UI change needed.
 */

import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  CalendarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

import { Avatar } from "../../common/Avatar";
import { FileTypeIcon } from "../../message/FileTypeIcon";
import { FileName } from "../../common/FileName";
import { formatRelativeTime } from "../../../utils/formatTime";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import {
  getConversationDisplayName,
  getConversationAvatar,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import type { Conversation, Message, UserSummary } from "../../../types";
import {
  dispatchOpenConversation,
  dispatchStartDirectMessage,
} from "../../../features/chat/events/chatUiEvents";
import type { ChatSearchUser } from "../../../features/chat/hooks/useChatUserSearch";
import { buildUserSearchSecondaryText } from "../../../features/chat/hooks/useChatUserSearch";
import {
  useGlobalContactSearch,
  useGlobalGroupSearch,
  useGlobalMessageSearch,
  useGlobalFileSearch,
  useConversationSenders,
  type GlobalMessageFilters,
  type GlobalFileFilters,
  type GlobalSearchFileType,
  type GlobalFileResult,
} from "../../../features/chat/hooks/useGlobalSearch";

type SearchTab = "all" | "contacts" | "messages" | "files";

interface GlobalSearchOverlayProps {
  currentUser: UserSummary;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

// --- shared atoms ------------------------------------------------------------

const Highlight: React.FC<{ text: string; query: string }> = ({
  text,
  query,
}) => {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded bg-[#1976D2]/15 px-0.5 text-[#1565C0]"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="px-4 pb-1.5 pt-3 text-[12px] font-semibold text-text-secondary">
    {label}
  </div>
);

const SeeAllButton: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mx-3 my-1.5 flex w-[calc(100%-1.5rem)] items-center justify-center rounded-md bg-surface-overlay py-2 text-[13px] font-medium text-text-secondary transition-micro hover:bg-[#1976D2]/8 hover:text-[#1565C0]"
  >
    {label}
  </button>
);

const RowButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
}> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1976D2]/30"
  >
    {children}
  </button>
);

const PersonRow: React.FC<{
  user: ChatSearchUser;
  query: string;
  onClick: () => void;
}> = ({ user, query, onClick }) => (
  <RowButton onClick={onClick}>
    <Avatar
      src={user.avatarUrl}
      alt={user.displayName}
      size="md"
      className="shrink-0"
    />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[14px] font-medium text-text-primary">
        <Highlight text={user.alias || user.displayName} query={query} />
      </p>
      <p className="truncate text-[12px] text-text-muted">
        {buildUserSearchSecondaryText(user)}
      </p>
    </div>
  </RowButton>
);

const ConversationRow: React.FC<{
  conversation: Conversation;
  currentUserId: string;
  query: string;
  onClick: () => void;
}> = ({ conversation, currentUserId, query, onClick }) => {
  const name = getConversationDisplayName(conversation, currentUserId);
  return (
    <RowButton onClick={onClick}>
      <Avatar
        src={getConversationAvatar(conversation, currentUserId)}
        alt={name}
        size="md"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-text-primary">
          <Highlight text={name} query={query} />
        </p>
        {conversation.lastMessage?.content ? (
          <p className="truncate text-[12px] text-text-muted">
            {conversation.lastMessage.content}
          </p>
        ) : null}
      </div>
    </RowButton>
  );
};

const MessageRow: React.FC<{
  message: Message;
  senderName: string;
  senderAvatar?: string | null;
  query: string;
  onClick: () => void;
}> = ({ message, senderName, senderAvatar, query, onClick }) => {
  const ts =
    (typeof message.serverTs === "string"
      ? message.serverTs
      : message.serverTs instanceof Date
        ? message.serverTs.toISOString()
        : undefined) ??
    (typeof message.createdAt === "string" ? message.createdAt : undefined);
  return (
    <RowButton onClick={onClick}>
      <Avatar
        src={senderAvatar}
        alt={senderName}
        size="md"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-medium text-text-primary">
            {senderName}
          </p>
          {ts ? (
            <span className="shrink-0 text-[11px] text-text-muted">
              {formatRelativeTime(new Date(ts))}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[12px] text-text-secondary">
          <Highlight text={message.content ?? ""} query={query} />
        </p>
      </div>
    </RowButton>
  );
};

const FileRow: React.FC<{
  file: GlobalFileResult;
  onClick: () => void;
}> = ({ file, onClick }) => (
  <RowButton onClick={onClick}>
    <FileTypeIcon
      type={getFileIconType(file.mimeType, file.fileName)}
      className="h-9 w-9 shrink-0"
    />
    <div className="min-w-0 flex-1">
      <FileName
        name={file.fileName}
        className="text-[14px] font-medium text-text-primary"
      />
      <p className="truncate text-[12px] text-text-muted">
        {formatFileSize(file.sizeBytes)} · {file.senderName} ·{" "}
        {formatRelativeTime(new Date(file.createdAt))}
      </p>
    </div>
  </RowButton>
);

// --- filter controls (messages + files) --------------------------------------

const FilterChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-micro",
      active
        ? "border-[#1976D2]/50 bg-[#1976D2]/8 text-[#1565C0]"
        : "border-border/70 bg-surface text-text-secondary hover:bg-surface-overlay",
    )}
  >
    <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
    <span className="max-w-[9rem] truncate">{label}</span>
    <ChevronDownIcon className="h-3.5 w-3.5 opacity-70" />
  </button>
);

/** A small popover positioned under its trigger. Fixed to escape overflow. */
const Popover: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-dropdown" onClick={onClose} aria-hidden />
      <div className="absolute left-0 top-full z-dropdown mt-1.5 min-w-[220px] rounded-lg border border-border/70 bg-surface p-1.5 shadow-lg">
        {children}
      </div>
    </>
  );
};

// --- main overlay ------------------------------------------------------------

const PREVIEW_COUNT = 5;

export const GlobalSearchOverlay: React.FC<GlobalSearchOverlayProps> = ({
  currentUser,
  query,
  onQueryChange,
  onClose,
  inputRef,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SearchTab>("all");

  // Selection dispatches the same global events the rest of the app uses for
  // navigation (AuthenticatedLayout listens), then closes the overlay.
  const onSelectUser = (userId: string) => {
    dispatchStartDirectMessage({ userId });
    onClose();
  };
  const onSelectConversation = (conversationId: string, messageId?: string) => {
    dispatchOpenConversation({ conversationId, messageId });
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [messageFilters, setMessageFilters] = useState<GlobalMessageFilters>({
    senderId: null,
    from: null,
    to: null,
  });
  const [fileFilters, setFileFilters] = useState<GlobalFileFilters>({
    type: "all",
    from: null,
    to: null,
  });

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const { people } = useGlobalContactSearch(query, true);
  const groups = useGlobalGroupSearch(query, currentUser);
  const { messages } = useGlobalMessageSearch(query, messageFilters);
  const { files } = useGlobalFileSearch(
    query,
    fileFilters,
    currentUser,
    tab === "all" || tab === "files",
  );
  const senders = useConversationSenders(currentUser);

  const senderById = useMemo(() => {
    const map = new Map<string, UserSummary>();
    for (const s of senders) map.set(s.id, s);
    return map;
  }, [senders]);

  const resolveSender = (message: Message) => {
    const s = senderById.get(message.senderId);
    return {
      name: s
        ? getUserDisplayName(s, { allowTechnicalFallback: true })
        : message.senderId,
      avatar: s?.avatar ?? null,
    };
  };

  const tabs: Array<{ id: SearchTab; label: string }> = [
    { id: "all", label: t("sidebar:globalSearch.tabs.all") },
    { id: "contacts", label: t("sidebar:globalSearch.tabs.contacts") },
    { id: "messages", label: t("sidebar:globalSearch.tabs.messages") },
    { id: "files", label: t("sidebar:globalSearch.tabs.files") },
  ];

  return (
    <div className="absolute inset-0 z-modal flex flex-col bg-[hsl(var(--chat-panel-bg))]">
      {/* Header: search input + Đóng */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <label className="relative block flex-1">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("sidebar:search.placeholder")}
            className="input-surface w-full pl-10 pr-9 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
            aria-label={t("sidebar:search.aria")}
            autoFocus
          />
          {hasQuery ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary"
              aria-label={t("sidebar:search.clearAria")}
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#1565C0] transition-micro hover:bg-[#1976D2]/8"
        >
          {t("sidebar:globalSearch.close")}
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        className="flex items-center gap-1 border-b border-border/60 px-2"
      >
        {tabs.map((tabItem) => {
          const active = tabItem.id === tab;
          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabItem.id)}
              className={clsx(
                "relative px-3 py-2.5 text-[13px] font-medium transition-micro",
                active
                  ? "text-[#1565C0]"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {tabItem.label}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#1565C0]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div
        className="sidebar-scrollbar min-h-0 flex-1 overflow-y-auto"
        aria-label={t("sidebar:globalSearch.resultAria")}
      >
        {!hasQuery ? (
          <EmptyPrompt text={t("sidebar:globalSearch.empty.prompt")} />
        ) : tab === "all" ? (
          <AllTab
            query={query}
            people={people}
            groups={groups}
            messages={messages}
            files={files}
            currentUser={currentUser}
            resolveSender={resolveSender}
            onSelectUser={onSelectUser}
            onSelectConversation={onSelectConversation}
            onGoTab={setTab}
          />
        ) : tab === "contacts" ? (
          <ContactsTab
            query={query}
            people={people}
            groups={groups}
            currentUser={currentUser}
            onSelectUser={onSelectUser}
            onSelectConversation={onSelectConversation}
          />
        ) : tab === "messages" ? (
          <MessagesTab
            query={query}
            messages={messages}
            senders={senders}
            filters={messageFilters}
            onFiltersChange={setMessageFilters}
            resolveSender={resolveSender}
            onSelectConversation={onSelectConversation}
          />
        ) : (
          <FilesTab
            files={files}
            filters={fileFilters}
            onFiltersChange={setFileFilters}
            onSelectConversation={onSelectConversation}
          />
        )}
      </div>
    </div>
  );
};

// --- states ------------------------------------------------------------------

const EmptyPrompt: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-col items-center px-8 pb-12 pt-20 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1976D2]/10">
      <MagnifyingGlassIcon
        className="h-7 w-7 text-[#1565C0]"
        strokeWidth={1.5}
      />
    </div>
    <p className="mt-4 max-w-[15rem] text-[13px] leading-relaxed text-text-muted">
      {text}
    </p>
  </div>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <p className="px-4 py-6 text-center text-[13px] text-text-muted">{text}</p>
);

// --- Tab: Tất cả -------------------------------------------------------------

interface AllTabProps {
  query: string;
  people: ChatSearchUser[];
  groups: Conversation[];
  messages: Message[];
  files: GlobalFileResult[];
  currentUser: UserSummary;
  resolveSender: (m: Message) => { name: string; avatar?: string | null };
  onSelectUser: (userId: string) => void;
  onSelectConversation: (conversationId: string, messageId?: string) => void;
  onGoTab: (tab: SearchTab) => void;
}

const AllTab: React.FC<AllTabProps> = ({
  query,
  people,
  groups,
  messages,
  files,
  currentUser,
  resolveSender,
  onSelectUser,
  onSelectConversation,
  onGoTab,
}) => {
  const { t } = useTranslation();
  const empty =
    people.length === 0 &&
    groups.length === 0 &&
    messages.length === 0 &&
    files.length === 0;

  if (empty) {
    return (
      <EmptyLine
        text={t("sidebar:globalSearch.empty.noResults", { query: query.trim() })}
      />
    );
  }

  return (
    <div className="pb-4">
      {people.length > 0 ? (
        <section>
          <SectionHeader
            label={t("sidebar:globalSearch.count.contacts", {
              count: people.length,
            })}
          />
          {people.slice(0, PREVIEW_COUNT).map((user) => (
            <PersonRow
              key={user.id}
              user={user}
              query={query}
              onClick={() => onSelectUser(user.id)}
            />
          ))}
          {people.length > PREVIEW_COUNT ? (
            <SeeAllButton
              label={t("sidebar:globalSearch.seeAll.contacts")}
              onClick={() => onGoTab("contacts")}
            />
          ) : null}
        </section>
      ) : null}

      {messages.length > 0 ? (
        <section>
          <SectionHeader
            label={t("sidebar:globalSearch.count.messages", {
              count: messages.length,
            })}
          />
          {messages.slice(0, PREVIEW_COUNT).map((message) => {
            const sender = resolveSender(message);
            return (
              <MessageRow
                key={message.id}
                message={message}
                senderName={sender.name}
                senderAvatar={sender.avatar}
                query={query}
                onClick={() =>
                  onSelectConversation(message.conversationId, message.id)
                }
              />
            );
          })}
          {messages.length > PREVIEW_COUNT ? (
            <SeeAllButton
              label={t("sidebar:globalSearch.seeAll.messages")}
              onClick={() => onGoTab("messages")}
            />
          ) : null}
        </section>
      ) : null}

      {files.length > 0 ? (
        <section>
          <SectionHeader
            label={t("sidebar:globalSearch.count.files", {
              count: files.length,
            })}
          />
          {files.slice(0, PREVIEW_COUNT).map((file) => (
            <FileRow
              key={`${file.conversationId}:${file.messageId}:${file.fileId}`}
              file={file}
              onClick={() =>
                onSelectConversation(file.conversationId, file.messageId)
              }
            />
          ))}
          {files.length > PREVIEW_COUNT ? (
            <SeeAllButton
              label={t("sidebar:globalSearch.seeAll.files")}
              onClick={() => onGoTab("files")}
            />
          ) : null}
        </section>
      ) : null}

      {/* Groups live under contacts in the dedicated tab; show inline too. */}
      {groups.length > 0 ? (
        <section>
          <SectionHeader
            label={t("sidebar:globalSearch.count.groups", {
              count: groups.length,
            })}
          />
          {groups.slice(0, PREVIEW_COUNT).map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              currentUserId={currentUser.id}
              query={query}
              onClick={() => onSelectConversation(conversation.id)}
            />
          ))}
          {groups.length > PREVIEW_COUNT ? (
            <SeeAllButton
              label={t("sidebar:globalSearch.seeAll.groups")}
              onClick={() => onGoTab("contacts")}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

// --- Tab: Liên hệ (people + groups) -----------------------------------------

interface ContactsTabProps {
  query: string;
  people: ChatSearchUser[];
  groups: Conversation[];
  currentUser: UserSummary;
  onSelectUser: (userId: string) => void;
  onSelectConversation: (conversationId: string) => void;
}

const ContactsTab: React.FC<ContactsTabProps> = ({
  query,
  people,
  groups,
  currentUser,
  onSelectUser,
  onSelectConversation,
}) => {
  const { t } = useTranslation();
  if (people.length === 0 && groups.length === 0) {
    return <EmptyLine text={t("sidebar:globalSearch.empty.noContacts")} />;
  }
  return (
    <div className="pb-4">
      {people.length > 0 ? (
        <section>
          <SectionHeader label={t("sidebar:globalSearch.sections.people")} />
          {people.map((user) => (
            <PersonRow
              key={user.id}
              user={user}
              query={query}
              onClick={() => onSelectUser(user.id)}
            />
          ))}
        </section>
      ) : null}
      {groups.length > 0 ? (
        <section>
          <SectionHeader label={t("sidebar:globalSearch.sections.groups")} />
          {groups.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              currentUserId={currentUser.id}
              query={query}
              onClick={() => onSelectConversation(conversation.id)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
};

// --- Tab: Tin nhắn (sender + date filters) -----------------------------------

interface MessagesTabProps {
  query: string;
  messages: Message[];
  senders: UserSummary[];
  filters: GlobalMessageFilters;
  onFiltersChange: (next: GlobalMessageFilters) => void;
  resolveSender: (m: Message) => { name: string; avatar?: string | null };
  onSelectConversation: (conversationId: string, messageId?: string) => void;
}

const MessagesTab: React.FC<MessagesTabProps> = ({
  query,
  messages,
  senders,
  filters,
  onFiltersChange,
  resolveSender,
  onSelectConversation,
}) => {
  const { t } = useTranslation();
  const [senderOpen, setSenderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [senderQuery, setSenderQuery] = useState("");

  const activeSenderName = filters.senderId
    ? getUserDisplayName(
        senders.find((s) => s.id === filters.senderId) ?? ({} as UserSummary),
        { allowTechnicalFallback: true },
      ) || t("sidebar:globalSearch.filter.sender")
    : t("sidebar:globalSearch.filter.sender");

  const dateLabel =
    filters.from || filters.to
      ? [filters.from, filters.to].filter(Boolean).join(" → ")
      : t("sidebar:globalSearch.filter.date");

  const filteredSenders = senders.filter((s) =>
    getUserDisplayName(s, { allowTechnicalFallback: true })
      .toLowerCase()
      .includes(senderQuery.toLowerCase()),
  );

  return (
    <div className="pb-4">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-[12px] text-text-muted">
          {t("sidebar:globalSearch.filter.label")}
        </span>
        <div className="relative">
          <FilterChip
            icon={<UserIcon className="h-4 w-4" />}
            label={activeSenderName}
            active={Boolean(filters.senderId)}
            onClick={() => {
              setSenderOpen((v) => !v);
              setDateOpen(false);
            }}
          />
          <Popover open={senderOpen} onClose={() => setSenderOpen(false)}>
            <div className="relative mb-1 px-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={senderQuery}
                onChange={(e) => setSenderQuery(e.target.value)}
                placeholder={t("sidebar:globalSearch.filter.searchPlaceholder")}
                className="w-full rounded-md border border-border/70 bg-background py-1.5 pl-8 pr-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredSenders.map((sender) => (
                <button
                  key={sender.id}
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...filters, senderId: sender.id });
                    setSenderOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-micro hover:bg-surface-overlay"
                >
                  <Avatar
                    src={sender.avatar}
                    alt={getUserDisplayName(sender, {
                      allowTechnicalFallback: true,
                    })}
                    size="xs"
                  />
                  <span className="truncate text-[13px] text-text-primary">
                    {getUserDisplayName(sender, {
                      allowTechnicalFallback: true,
                    })}
                  </span>
                </button>
              ))}
            </div>
          </Popover>
        </div>

        <div className="relative">
          <FilterChip
            icon={<CalendarIcon className="h-4 w-4" />}
            label={dateLabel}
            active={Boolean(filters.from || filters.to)}
            onClick={() => {
              setDateOpen((v) => !v);
              setSenderOpen(false);
            }}
          />
          <Popover open={dateOpen} onClose={() => setDateOpen(false)}>
            <DateRangeFields
              from={filters.from}
              to={filters.to}
              onApply={(from, to) => {
                onFiltersChange({ ...filters, from, to });
                setDateOpen(false);
              }}
              onCancel={() => setDateOpen(false)}
            />
          </Popover>
        </div>

        {(filters.senderId || filters.from || filters.to) && (
          <button
            type="button"
            onClick={() =>
              onFiltersChange({ senderId: null, from: null, to: null })
            }
            className="text-[12px] font-medium text-[#1565C0] hover:underline"
          >
            {t("sidebar:globalSearch.filter.clear")}
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <EmptyLine text={t("sidebar:globalSearch.empty.noMessages")} />
      ) : (
        messages.map((message) => {
          const sender = resolveSender(message);
          return (
            <MessageRow
              key={message.id}
              message={message}
              senderName={sender.name}
              senderAvatar={sender.avatar}
              query={query}
              onClick={() =>
                onSelectConversation(message.conversationId, message.id)
              }
            />
          );
        })
      )}
    </div>
  );
};

// --- Tab: File (type + date filters) -----------------------------------------

interface FilesTabProps {
  files: GlobalFileResult[];
  filters: GlobalFileFilters;
  onFiltersChange: (next: GlobalFileFilters) => void;
  onSelectConversation: (conversationId: string, messageId?: string) => void;
}

const FILE_TYPES: GlobalSearchFileType[] = [
  "all",
  "image",
  "video",
  "document",
  "audio",
  "other",
];

const FilesTab: React.FC<FilesTabProps> = ({
  files,
  filters,
  onFiltersChange,
  onSelectConversation,
}) => {
  const { t } = useTranslation();
  const [typeOpen, setTypeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // Literal keys (not a template) so the i18n checker credits every fileType key.
  const typeLabel: Record<GlobalSearchFileType, string> = {
    all: t("sidebar:globalSearch.fileType.all"),
    image: t("sidebar:globalSearch.fileType.image"),
    video: t("sidebar:globalSearch.fileType.video"),
    document: t("sidebar:globalSearch.fileType.document"),
    audio: t("sidebar:globalSearch.fileType.audio"),
    other: t("sidebar:globalSearch.fileType.other"),
  };

  const dateLabel =
    filters.from || filters.to
      ? [filters.from, filters.to].filter(Boolean).join(" → ")
      : t("sidebar:globalSearch.filter.date");

  return (
    <div className="pb-4">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-[12px] text-text-muted">
          {t("sidebar:globalSearch.filter.label")}
        </span>
        <div className="relative">
          <FilterChip
            icon={<ChevronRightIcon className="h-4 w-4" />}
            label={typeLabel[filters.type]}
            active={filters.type !== "all"}
            onClick={() => {
              setTypeOpen((v) => !v);
              setDateOpen(false);
            }}
          />
          <Popover open={typeOpen} onClose={() => setTypeOpen(false)}>
            {FILE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onFiltersChange({ ...filters, type });
                  setTypeOpen(false);
                }}
                className={clsx(
                  "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-micro hover:bg-surface-overlay",
                  filters.type === type
                    ? "font-medium text-[#1565C0]"
                    : "text-text-primary",
                )}
              >
                {typeLabel[type]}
              </button>
            ))}
          </Popover>
        </div>

        <div className="relative">
          <FilterChip
            icon={<CalendarIcon className="h-4 w-4" />}
            label={dateLabel}
            active={Boolean(filters.from || filters.to)}
            onClick={() => {
              setDateOpen((v) => !v);
              setTypeOpen(false);
            }}
          />
          <Popover open={dateOpen} onClose={() => setDateOpen(false)}>
            <DateRangeFields
              from={filters.from}
              to={filters.to}
              onApply={(from, to) => {
                onFiltersChange({ ...filters, from, to });
                setDateOpen(false);
              }}
              onCancel={() => setDateOpen(false)}
            />
          </Popover>
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyLine text={t("sidebar:globalSearch.empty.noFiles")} />
      ) : (
        files.map((file) => (
          <FileRow
            key={`${file.conversationId}:${file.messageId}:${file.fileId}`}
            file={file}
            onClick={() =>
              onSelectConversation(file.conversationId, file.messageId)
            }
          />
        ))
      )}
    </div>
  );
};

// --- date range (native inputs — no picker lib) ------------------------------

const DateRangeFields: React.FC<{
  from: string | null;
  to: string | null;
  onApply: (from: string | null, to: string | null) => void;
  onCancel: () => void;
}> = ({ from, to, onApply, onCancel }) => {
  const { t } = useTranslation();
  const [localFrom, setLocalFrom] = useState(from ?? "");
  const [localTo, setLocalTo] = useState(to ?? "");

  return (
    <div className="w-[240px] p-1.5">
      <p className="px-1 pb-1.5 text-[12px] font-medium text-text-secondary">
        {t("sidebar:globalSearch.filter.pickRange")}
      </p>
      <label className="mb-1.5 block px-1">
        <span className="mb-0.5 block text-[11px] text-text-muted">
          {t("sidebar:globalSearch.filter.from")}
        </span>
        <input
          type="date"
          value={localFrom}
          max={localTo || undefined}
          onChange={(e) => setLocalFrom(e.target.value)}
          className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-[13px] text-text-primary focus:border-[#1976D2]/60 focus:outline-none"
        />
      </label>
      <label className="mb-2 block px-1">
        <span className="mb-0.5 block text-[11px] text-text-muted">
          {t("sidebar:globalSearch.filter.to")}
        </span>
        <input
          type="date"
          value={localTo}
          min={localFrom || undefined}
          onChange={(e) => setLocalTo(e.target.value)}
          className="w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-[13px] text-text-primary focus:border-[#1976D2]/60 focus:outline-none"
        />
      </label>
      <div className="flex justify-end gap-1.5 px-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-micro hover:bg-surface-overlay"
        >
          {t("sidebar:globalSearch.filter.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onApply(localFrom || null, localTo || null)}
          className="rounded-md bg-[#1565C0] px-3 py-1.5 text-[13px] font-medium text-[#E7E9EB] transition-micro hover:bg-[#1976D2]"
        >
          {t("sidebar:globalSearch.filter.confirm")}
        </button>
      </div>
    </div>
  );
};

export default GlobalSearchOverlay;
