/**
 * @fileoverview useGlobalSearch — aggregates result sources for the Zalo-style
 * global search overlay: contacts (people), groups, messages and files.
 *
 * Data sources by tab:
 *  - People   → useChatUserSearch (real /users/search) + useFriendSuggestions
 *  - Groups   → in-memory conversations from chatStore (real, no endpoint)
 *  - Messages → useMessageSearch (real searchMessages endpoint) + senderId/date filters
 *  - Files    → conversationResourcesApi.getFiles per conversation, merged client-side.
 *
 * ponytail: files are aggregated FE-side across the user's conversations because
 * no cross-conversation "global files" endpoint exists yet. Contract filed in
 * chat-api-service/docs/requests (FE__global-search) to add a real one; swap
 * `useGlobalFileSearch` internals when it lands.
 */

import { useEffect, useMemo, useState } from "react";

import { useChatStore } from "../../../stores";
import type { Conversation, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import {
  createConversationActivityComparator,
  getConversationPinnedTimestamp,
} from "../../../utils/conversationRanking";
import { conversationResourcesApi } from "../../../services/api";
import type { ConversationResourcesFileItem } from "../../../services/api";
import { getFileIconType } from "../../../utils/formatFileSize";
import { useDebounce } from "../../../hooks/useDebounce";
import { useMessageSearch } from "../../../hooks/useMessageSearch";
import { useChatUserSearch, useFriendSuggestions } from "./useChatUserSearch";
import type { ChatSearchUser } from "./useChatUserSearch";
import { matchesContactQuery } from "../../../utils/contactSearchMatch";

export type GlobalSearchFileType =
  "all" | "image" | "video" | "document" | "audio" | "other";

export interface GlobalMessageFilters {
  senderId: string | null;
  from: string | null; // ISO date (yyyy-mm-dd)
  to: string | null;
}

export interface GlobalFileFilters {
  type: GlobalSearchFileType;
  from: string | null;
  to: string | null;
}

/** A file result carries the owning conversation so we can navigate + label it. */
export interface GlobalFileResult extends ConversationResourcesFileItem {
  conversationId: string;
  conversationName: string;
}

/** Map a mime type to the coarse file-type filter buckets shown in the UI. */
export const fileTypeOf = (
  mime: string,
  fileName: string,
): Exclude<GlobalSearchFileType, "all"> => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const icon = getFileIconType(mime, fileName);
  if (icon === "image" || icon === "video" || icon === "audio") return icon;
  return "document";
};

export const withinDateRange = (
  iso: string,
  from: string | null,
  to: string | null,
): boolean => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
};

// --- Contacts (people) -------------------------------------------------------

export const useGlobalContactSearch = (query: string, enabled: boolean) => {
  const trimmed = query.trim();
  // Friend list is local; server search covers non-friends. Merge, dedupe by id.
  const { suggestions, isLoading: isFriendLoading } = useFriendSuggestions({
    query: trimmed,
    enabled,
  });
  const {
    results,
    isLoading: isServerLoading,
    debouncedQuery,
  } = useChatUserSearch(trimmed, {
    enabled: enabled && trimmed.length >= 2,
    minQueryLength: 2,
  });

  return useMemo(() => {
    const byId = new Map<string, ChatSearchUser>();
    for (const u of suggestions) byId.set(u.id, u);
    for (const u of results) {
      if (
        matchesContactQuery(trimmed, [
          u.alias,
          u.displayName,
          u.fullName,
          u.username,
          u.employeeCode,
          u.departmentName,
          u.unitCode,
          u.title,
        ]) &&
        !byId.has(u.id)
      ) {
        byId.set(u.id, u);
      }
    }
    return {
      people: Array.from(byId.values()),
      isLoading:
        isFriendLoading ||
        isServerLoading ||
        (trimmed.length >= 2 && debouncedQuery.trim() !== trimmed),
    };
  }, [
    debouncedQuery,
    isFriendLoading,
    isServerLoading,
    results,
    suggestions,
    trimmed,
  ]);
};

// --- Groups (in-memory conversations) ---------------------------------------

export const useGlobalGroupSearch = (
  query: string,
  currentUser: UserSummary,
): Conversation[] => {
  const conversationById = useChatStore((s) => s.conversationById);
  const orderedIds = useChatStore((s) => s.orderedConversationIds);

  return useMemo(() => {
    const conversations = orderedIds
      .map((id) => conversationById[id])
      .filter((c): c is Conversation => Boolean(c) && !isDirectConversation(c));
    const pinnedAtById = new Map(
      conversations
        .map(
          (conversation) =>
            [
              conversation.id,
              getConversationPinnedTimestamp(conversation),
            ] as const,
        )
        .filter(([, pinnedAt]) => pinnedAt > 0),
    );
    const comparator = createConversationActivityComparator(
      new Set(pinnedAtById.keys()),
      pinnedAtById,
    );
    return conversations
      .filter((c) => {
        return matchesContactQuery(query, [
          getConversationDisplayName(c, currentUser.id),
        ]);
      })
      .sort(comparator);
  }, [conversationById, orderedIds, query, currentUser.id]);
};

// --- Messages (real search endpoint, server-side sender/date filters) --------

/** yyyy-mm-dd → local-day start/end ISO with offset (contract mapping (B)). */
export const dayStartIso = (day: string | null): string | null =>
  day ? new Date(`${day}T00:00:00`).toISOString() : null;
export const dayEndIso = (day: string | null): string | null =>
  day ? new Date(`${day}T23:59:59.999`).toISOString() : null;

export const useGlobalMessageSearch = (
  query: string,
  filters: GlobalMessageFilters,
) => {
  const {
    setQuery,
    debouncedQuery,
    results,
    isLoading,
    error,
    hasMore,
    loadMore,
  } = useMessageSearch({
    limit: 30,
    senderId: filters.senderId,
    from: dayStartIso(filters.from),
    to: dayEndIso(filters.to),
  });

  useEffect(() => {
    setQuery(query);
  }, [query, setQuery]);

  const queryIsCurrent = debouncedQuery.trim() === query.trim();
  return {
    messages: queryIsCurrent ? results : [],
    isLoading: isLoading || !queryIsCurrent,
    error,
    hasMore: queryIsCurrent && hasMore,
    loadMore,
  };
};

// --- Files (aggregated across conversations, client-side) --------------------

export const useGlobalFileSearch = (
  query: string,
  filters: GlobalFileFilters,
  currentUser: UserSummary,
  enabled: boolean,
) => {
  const conversationById = useChatStore((s) => s.conversationById);
  const [files, setFiles] = useState<GlobalFileResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 300);

  // Real global endpoint: server scopes to the caller's conversations and
  // applies q/type/date filters. Each item carries conversationId for nav; we
  // enrich with the conversation display name from the local store.
  useEffect(() => {
    if (!enabled) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setFiles([]);
    setIsLoading(true);

    conversationResourcesApi
      .searchFilesGlobal({
        q: debouncedQuery || undefined,
        type: filters.type,
        from: dayStartIso(filters.from) ?? undefined,
        to: dayEndIso(filters.to) ?? undefined,
        page: 1,
        limit: 40,
      })
      .then((res) => {
        if (cancelled) return;
        const items = res.success ? res.data.data : [];
        setFiles(
          items.map((item): GlobalFileResult => {
            const conversationId = item.conversationId ?? "";
            const conversation = conversationById[conversationId];
            return {
              ...item,
              conversationId,
              conversationName: conversation
                ? getConversationDisplayName(conversation, currentUser.id)
                : conversationId,
            };
          }),
        );
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFiles([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    debouncedQuery,
    filters.type,
    filters.from,
    filters.to,
    conversationById,
    currentUser.id,
  ]);

  const queryIsCurrent = debouncedQuery === query.trim();
  return {
    files: queryIsCurrent ? files : [],
    isLoading: isLoading || !queryIsCurrent,
  };
};

/** Distinct senders across the user's conversations — feeds the sender filter. */
export const useConversationSenders = (
  currentUser: UserSummary,
): UserSummary[] => {
  const conversationById = useChatStore((s) => s.conversationById);
  const orderedIds = useChatStore((s) => s.orderedConversationIds);

  return useMemo(() => {
    const byId = new Map<string, UserSummary>();
    for (const id of orderedIds) {
      const conversation = conversationById[id];
      if (!conversation) continue;
      for (const p of conversation.participants ?? []) {
        if (p.id === currentUser.id || byId.has(p.id)) continue;
        byId.set(p.id, p);
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      getUserDisplayName(a, { allowTechnicalFallback: true }).localeCompare(
        getUserDisplayName(b, { allowTechnicalFallback: true }),
      ),
    );
  }, [conversationById, orderedIds, currentUser.id]);
};
