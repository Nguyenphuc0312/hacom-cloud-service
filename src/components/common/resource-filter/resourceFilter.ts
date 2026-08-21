/**
 * Filtering + day grouping for the shared-resources ("Kho lưu trữ") tabs.
 *
 * All three resource kinds (media / files / links) carry `senderId`,
 * `senderName` and `createdAt`, so one set of helpers serves every tab.
 */
import { toLocalIsoDay } from "./dateRange";

/** The subset of a resource item these helpers need. */
export interface FilterableResource {
  senderId: string;
  senderName: string;
  createdAt: string;
  /** Links carry no avatar in the API response, hence optional. */
  senderAvatarUrl?: string | null;
}

export interface ResourceSender {
  id: string;
  /** Raw name from the API — the caller resolves the alias for display. */
  name: string;
  avatarUrl: string | null;
}

export interface ResourceFilters {
  senderId: string | null;
  /** Inclusive ISO yyyy-mm-dd bounds. */
  from: string | null;
  to: string | null;
}

export const EMPTY_RESOURCE_FILTERS: ResourceFilters = {
  senderId: null,
  from: null,
  to: null,
};

export const hasActiveFilters = (filters: ResourceFilters): boolean =>
  Boolean(filters.senderId || filters.from || filters.to);

/**
 * Distinct senders present in `items`, ordered by name so the dropdown is
 * scannable. Built from the loaded page only — the resources endpoints do not
 * expose a per-conversation contributor list, so a sender who has not appeared
 * in a fetched page cannot be offered as a choice.
 */
export const collectSenders = (
  items: readonly FilterableResource[],
): ResourceSender[] => {
  const byId = new Map<string, ResourceSender>();
  for (const item of items) {
    const existing = byId.get(item.senderId);
    if (!existing) {
      byId.set(item.senderId, {
        id: item.senderId,
        name: item.senderName,
        avatarUrl: item.senderAvatarUrl ?? null,
      });
      // A later item may carry the avatar that the first one lacked (links
      // never include one), so fill the gap rather than keep the first row.
    } else if (!existing.avatarUrl && item.senderAvatarUrl) {
      existing.avatarUrl = item.senderAvatarUrl;
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
};

/** True when the item passes every active filter. */
export const matchesFilters = (
  item: FilterableResource,
  filters: ResourceFilters,
): boolean => {
  if (filters.senderId && item.senderId !== filters.senderId) return false;
  if (filters.from || filters.to) {
    const created = new Date(item.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    // Compare on the local calendar day so a range reads inclusively, matching
    // the date shown on the row.
    const day = toLocalIsoDay(created);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
  }
  return true;
};

export interface ResourceDayGroup<T> {
  /** ISO yyyy-mm-dd of the local calendar day. */
  iso: string;
  items: T[];
}

/**
 * Group items by the local calendar day they were sent on, newest day first.
 *
 * The panel previously printed a single heading taken from `items[0]`, which
 * mislabelled every older item underneath it.
 */
export const groupByDay = <T extends FilterableResource>(
  items: readonly T[],
): Array<ResourceDayGroup<T>> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const created = new Date(item.createdAt);
    // Undated items would otherwise vanish; keep them under a stable "" key
    // that sorts last.
    const iso = Number.isNaN(created.getTime()) ? "" : toLocalIsoDay(created);
    const bucket = groups.get(iso);
    if (bucket) bucket.push(item);
    else groups.set(iso, [item]);
  }
  return [...groups.entries()]
    .map(([iso, groupItems]) => ({ iso, items: groupItems }))
    .sort((a, b) => b.iso.localeCompare(a.iso));
};

/** Heading text for a day group, e.g. "Ngày 13 tháng 08" (year added if past). */
export const formatDayHeading = (iso: string): string => {
  if (!iso) return "Không rõ ngày";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Không rõ ngày";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `Ngày ${date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
};
