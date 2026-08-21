/**
 * "Người gửi" / "Ngày gửi" filter bar for the shared-resources modal.
 *
 * Senders come from the items currently loaded (see `collectSenders`), so the
 * sender chip is disabled while a page is still empty rather than opening onto
 * an empty list.
 */
import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CalendarIcon,
  MagnifyingGlassIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../Avatar";
import { resolvePublicResourceUrl } from "../../../config";
import { enrichUserProfile } from "../../../services/enrichUserProfile";
import {
  useResolvedAvatarUrl,
  useResolvedDisplayName,
} from "../../../stores/useResolvedDisplayName";
import { FilterChip, Popover, DateRangeFields } from "./FilterControls";
import { isoToDisplay } from "./dateRange";
import {
  EMPTY_RESOURCE_FILTERS,
  hasActiveFilters,
  type ResourceFilters,
  type ResourceSender,
} from "./resourceFilter";

interface ResourceFilterBarProps {
  filters: ResourceFilters;
  onFiltersChange: (filters: ResourceFilters) => void;
  senders: ResourceSender[];
}

/**
 * One option row. Split into its own component because the alias lookup is a
 * hook and so cannot run inside the sender loop.
 */
const SenderOption: React.FC<{
  sender: ResourceSender;
  selected: boolean;
  query: string;
  onSelect: () => void;
}> = ({ sender, selected, query, onSelect }) => {
  const name = useResolvedDisplayName(sender.id, sender.name);
  // `sender.avatarUrl` is the frozen `sender_snapshot` url and is usually a
  // long-expired signature (403) — see `useResolvedAvatarUrl` for the details.
  // The hook prefers the freshly signed enriched/friend url over it.
  const avatarUrl = useResolvedAvatarUrl(sender.id, sender.avatarUrl);
  const q = query.trim().toLowerCase();
  // Match the alias too, so typing the nickname finds the person.
  if (q && !name.toLowerCase().includes(q) && !sender.name.toLowerCase().includes(q)) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-micro hover:bg-surface-overlay",
        selected && "bg-[#1976D2]/8",
      )}
    >
      {/* Avatar takes the src as-is, so relative paths from the API must be
          resolved here — same as every other avatar call site. */}
      <Avatar
        src={resolvePublicResourceUrl(avatarUrl ?? undefined) ?? null}
        alt={name}
        size="xs"
        className="shrink-0"
      />
      <span
        className={clsx(
          "truncate text-[13px]",
          selected ? "font-medium text-[#1565C0]" : "text-text-primary",
        )}
      >
        {name}
      </span>
    </button>
  );
};

/** Chip label for the active sender — needs the same alias resolution. */
const SenderChipLabel: React.FC<{
  sender: ResourceSender | undefined;
  fallback: string;
}> = ({ sender, fallback }) => {
  const name = useResolvedDisplayName(sender?.id, sender?.name ?? fallback);
  return <>{sender ? name : fallback}</>;
};

export const ResourceFilterBar: React.FC<ResourceFilterBarProps> = ({
  filters,
  onFiltersChange,
  senders,
}) => {
  const { t } = useTranslation();
  const [senderOpen, setSenderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [senderQuery, setSenderQuery] = useState("");

  const activeSender = senders.find((s) => s.id === filters.senderId);

  // The panel can be opened without ever visiting the timeline, and nothing
  // else enriches these users, so the dropdown would otherwise show the raw
  // API `senderName` and no "tên gợi nhớ" — and, since the resources endpoints
  // mostly return `senderAvatarUrl: null`, no avatar either.
  //
  // Runs as soon as the sender list exists rather than only on open: waiting for
  // the click meant the first paint of the dropdown was always
  // names-with-initials, with avatars popping in a moment later.
  //
  // `senderOpen` is also a dependency so re-opening re-enriches: avatar URLs are
  // presigned and expire (see `readFreshAvatarUrl`), so a modal left open past
  // the TTL needs a fresh signature or its avatars decay to initials with
  // nothing to restore them. Cheap to repeat — `enrichUserProfile` throttles per
  // user (5 min, shorter than the avatar TTL so a refresh is always available)
  // and `loadUserProfile` coalesces + TTL-caches, so this stays one batched
  // request for the whole list however many bars are mounted.
  const senderIdsKey = senders.map((s) => s.id).join(",");
  useEffect(() => {
    if (!senderIdsKey) return;
    for (const id of senderIdsKey.split(",")) enrichUserProfile(id);
  }, [senderIdsKey, senderOpen]);

  const dateLabel =
    filters.from || filters.to
      ? [filters.from, filters.to]
          .filter((d): d is string => Boolean(d))
          .map(isoToDisplay)
          .join(" → ")
      : t("sidebar:globalSearch.filter.date");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <FilterChip
          icon={<UserIcon className="h-4 w-4" />}
          label={
            <SenderChipLabel
              sender={activeSender}
              fallback={t("sidebar:globalSearch.filter.sender")}
            />
          }
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
            {senders.length === 0 ? (
              <p className="px-2 py-3 text-center text-[13px] text-text-muted">
                {t("sidebar:globalSearch.filter.noSenders")}
              </p>
            ) : (
              senders.map((sender) => (
                <SenderOption
                  key={sender.id}
                  sender={sender}
                  selected={filters.senderId === sender.id}
                  query={senderQuery}
                  onSelect={() =>
                    // Re-picking the active sender clears the filter, so the
                    // chip toggles without hunting for "Xóa lọc".
                    {
                      onFiltersChange({
                        ...filters,
                        senderId:
                          filters.senderId === sender.id ? null : sender.id,
                      });
                      setSenderOpen(false);
                    }
                  }
                />
              ))
            )}
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
        {/* Right-aligned: the date chip sits far enough along the bar that a
            left-anchored calendar overflows the modal and clips its last
            columns and the confirm button. */}
        <Popover open={dateOpen} onClose={() => setDateOpen(false)} align="right">
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

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onFiltersChange(EMPTY_RESOURCE_FILTERS)}
          className="text-[12px] font-medium text-[#1565C0] hover:underline"
        >
          {t("sidebar:globalSearch.filter.clear")}
        </button>
      )}
    </div>
  );
};
