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
import type { Conversation, Message, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import { compareConversationsByActivity } from "../../../utils/conversationRanking";
import { conversationResourcesApi } from "../../../services/api";
import type { ConversationResourcesFileItem } from "../../../services/api";
import { getFileIconType } from "../../../utils/formatFileSize";
import { useMessageSearch } from "../../../hooks/useMessageSearch";
import { useChatUserSearch, useFriendSuggestions } from "./useChatUserSearch";
import type { ChatSearchUser } from "./useChatUserSearch";

export type GlobalSearchFileType =
  | "all"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "other";

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

const removeDiacritics = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const normalize = (s: string): string => removeDiacritics(s.toLowerCase().trim());

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
  const { suggestions } = useFriendSuggestions({ query: trimmed, enabled });
  const { results, isLoading } = useChatUserSearch(trimmed, {
    enabled: enabled && trimmed.length >= 2,
    minQueryLength: 2,
  });

  return useMemo(() => {
    const byId = new Map<string, ChatSearchUser>();
    for (const u of suggestions) byId.set(u.id, u);
    for (const u of results) if (!byId.has(u.id)) byId.set(u.id, u);
    return { people: Array.from(byId.values()), isLoading };
  }, [suggestions, results, isLoading]);
};

// --- Groups (in-memory conversations) ---------------------------------------

export const useGlobalGroupSearch = (
  query: string,
  currentUser: UserSummary,
): Conversation[] => {
  const conversationById = useChatStore((s) => s.conversationById);
  const orderedIds = useChatStore((s) => s.orderedConversationIds);

  return useMemo(() => {
    const q = normalize(query);
    return orderedIds
      .map((id) => conversationById[id])
      .filter((c): c is Conversation => Boolean(c) && !isDirectConversation(c))
      .filter((c) => {
        if (!q) return true;
        return normalize(getConversationDisplayName(c, currentUser.id)).includes(q);
      })
      .sort(compareConversationsByActivity);
  }, [conversationById, orderedIds, query, currentUser.id]);
};

// --- Messages (real search endpoint + client-side sender/date filters) --------

export const useGlobalMessageSearch = (
  query: string,
  filters: GlobalMessageFilters,
) => {
  // ponytail: senderId/date are applied client-side over the fetched page. The
  // contract asks BE to accept senderId/from/to for server-side filtering; once
  // shipped, pass them into useMessageSearch's params and drop the local filter.
  const { setQuery, results, isLoading, hasMore, loadMore } = useMessageSearch({
    limit: 30,
  });

  useEffect(() => {
    setQuery(query);
  }, [query, setQuery]);

  const filtered = useMemo(() => {
    return results.filter((m: Message) => {
      if (filters.senderId && m.senderId !== filters.senderId) return false;
      const ts =
        (typeof m.serverTs === "string" ? m.serverTs : m.serverTs?.toISOString?.()) ??
        (typeof m.createdAt === "string" ? m.createdAt : undefined);
      if (ts && !withinDateRange(ts, filters.from, filters.to)) return false;
      return true;
    });
  }, [results, filters.senderId, filters.from, filters.to]);

  return { messages: filtered, isLoading, hasMore, loadMore };
};

// --- Files (aggregated across conversations, client-side) --------------------

export const useGlobalFileSearch = (
  query: string,
  filters: GlobalFileFilters,
  currentUser: UserSummary,
  enabled: boolean,
) => {
  const conversationById = useChatStore((s) => s.conversationById);
  const orderedIds = useChatStore((s) => s.orderedConversationIds);
  const [files, setFiles] = useState<GlobalFileResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Aggregate the first page of files from the most-recent conversations. This
  // is a FE bridge until a global endpoint exists (see contract).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const topIds = orderedIds.slice(0, 15);
    setIsLoading(true);

    Promise.allSettled(
      topIds.map(async (id) => {
        const res = await conversationResourcesApi.getFiles(id, 1, 20);
        const items = res.success ? res.data.data : [];
        const conversation = conversationById[id];
        const name = conversation
          ? getConversationDisplayName(conversation, currentUser.id)
          : id;
        return items.map(
          (item): GlobalFileResult => ({
            ...item,
            conversationId: id,
            conversationName: name,
          }),
        );
      }),
    ).then((settled) => {
      if (cancelled) return;
      const all = settled.flatMap((r) =>
        r.status === "fulfilled" ? r.value : [],
      );
      setFiles(all);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, orderedIds.join(",")]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return files
      .filter((f) => (q ? normalize(f.fileName).includes(q) : true))
      .filter((f) =>
        filters.type === "all"
          ? true
          : fileTypeOf(f.mimeType, f.fileName) === filters.type,
      )
      .filter((f) => withinDateRange(f.createdAt, filters.from, filters.to))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [files, query, filters.type, filters.from, filters.to]);

  return { files: filtered, isLoading };
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
