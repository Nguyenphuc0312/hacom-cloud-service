import { chatApi } from "../features/api/chatApi";
import { blobPreviewCache } from "../lib/blobPreviewCache";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { store, type RootState } from "../store";
import { useAuthStore, useChatStore } from "../stores";

type ConversationCount = {
  conversationId: string;
  count: number;
};

type ProbeSnapshot = {
  label: string;
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  jsHeapSizeLimit: number | null;
  domNodeCount: number;
  mountedMessageItemCount: number;
  mountedConversationItemCount: number;
  mountedPresenceDotCount: number;
  mountedTooltipPopoverCount: number;
  rtkQueryMessageCounts: ConversationCount[];
  rtkQueryTotalMessages: number;
  legacyMessageCounts: ConversationCount[];
  legacyTotalMessages: number;
  blobPreviewCacheSize: number;
  websocketListenerCount: number | null;
  websocketConnectionState: string | null;
  selectedConversationId: string | null;
};

type MemoryRuntimeProbe = {
  snapshot: (label?: string) => ProbeSnapshot;
  loadOlderMessages: (
    conversationId: string,
    beforeSeq: number,
    limit?: number,
  ) => Promise<ProbeSnapshot>;
  reconnectSocket: (times?: number) => Promise<ProbeSnapshot>;
  seedBlobPreviewCache: (count: number) => number;
  clearBlobPreviewCache: () => number;
  logoutSoft: () => Promise<ProbeSnapshot>;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
};

declare global {
  interface Window {
    __chatMemoryProbe?: MemoryRuntimeProbe;
  }
}

const isProbeEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  return (
    search.get("memoryProbe") === "1" ||
    window.localStorage.getItem("chat-memory-probe") === "1"
  );
};

const readMemory = (): Pick<
  ProbeSnapshot,
  "usedJSHeapSize" | "totalJSHeapSize" | "jsHeapSizeLimit"
> => {
  const memory = (window.performance as PerformanceWithMemory).memory;
  return {
    usedJSHeapSize:
      typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null,
    totalJSHeapSize:
      typeof memory?.totalJSHeapSize === "number" ? memory.totalJSHeapSize : null,
    jsHeapSizeLimit:
      typeof memory?.jsHeapSizeLimit === "number" ? memory.jsHeapSizeLimit : null,
  };
};

const getRtkQueryMessageCounts = (
  state: RootState,
): ConversationCount[] => {
  const queries = state.chatApi.queries as Record<
    string,
    { endpointName?: string; data?: unknown } | undefined
  >;

  return Object.values(queries)
    .filter((entry) => entry?.endpointName === "getMessages")
    .map((entry) => {
      const data = entry?.data as
        | { conversationId?: unknown; messages?: unknown }
        | undefined;
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      return {
        conversationId:
          typeof data?.conversationId === "string"
            ? data.conversationId
            : "unknown",
        count: messages.length,
      };
    })
    .sort((a, b) => a.conversationId.localeCompare(b.conversationId));
};

const getLegacyMessageCounts = (): ConversationCount[] => {
  const { messageIdsByConversation } = useChatStore.getState();
  return Object.entries(messageIdsByConversation)
    .map(([conversationId, ids]) => ({
      conversationId,
      count: ids.length,
    }))
    .sort((a, b) => a.conversationId.localeCompare(b.conversationId));
};

const countMountedTooltipPopovers = (): number =>
  document.querySelectorAll(
    [
      "[role='tooltip']",
      "[role='menu']",
      "[role='dialog'][data-render-probe='popover']",
      "[data-render-probe='tooltip']",
      "[data-render-probe='popover']",
      "[data-radix-popper-content-wrapper]",
    ].join(","),
  ).length;

const snapshot = (label = "snapshot"): ProbeSnapshot => {
  globalThis.gc?.();
  const rtkQueryMessageCounts = getRtkQueryMessageCounts(store.getState());
  const legacyMessageCounts = getLegacyMessageCounts();
  const socket = getSocket();

  return {
    label,
    ...readMemory(),
    domNodeCount: document.getElementsByTagName("*").length,
    mountedMessageItemCount: document.querySelectorAll(
      "[data-render-probe='message-item']",
    ).length,
    mountedConversationItemCount: document.querySelectorAll(
      "[data-render-probe='conversation-item']",
    ).length,
    mountedPresenceDotCount: document.querySelectorAll(
      "[data-render-probe='presence-dot']",
    ).length,
    mountedTooltipPopoverCount: countMountedTooltipPopovers(),
    rtkQueryMessageCounts,
    rtkQueryTotalMessages: rtkQueryMessageCounts.reduce(
      (sum, item) => sum + item.count,
      0,
    ),
    legacyMessageCounts,
    legacyTotalMessages: legacyMessageCounts.reduce(
      (sum, item) => sum + item.count,
      0,
    ),
    blobPreviewCacheSize: blobPreviewCache.size(),
    websocketListenerCount: socket?.getListenerCount() ?? null,
    websocketConnectionState: socket?.getConnectionState() ?? null,
    selectedConversationId: useChatStore.getState().selectedConversationId,
  };
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export const installMemoryRuntimeProbe = (): boolean => {
  if (!isProbeEnabled()) return false;
  if (window.__chatMemoryProbe) return true;

  window.__chatMemoryProbe = {
    snapshot,
    async loadOlderMessages(conversationId, beforeSeq, limit = 50) {
      await store
        .dispatch(
          chatApi.endpoints.getMessages.initiate(
            {
              conversationId,
              beforeSeq,
              limit,
            },
            { forceRefetch: true },
          ),
        )
        .unwrap();
      return snapshot(`load-older-${conversationId}-${beforeSeq}`);
    },
    async reconnectSocket(times = 1) {
      const cycles = Math.max(1, Math.floor(times));
      for (let i = 0; i < cycles; i += 1) {
        disconnectSocket();
        await delay(50);
        connectSocket();
        await delay(150);
      }
      return snapshot(`reconnect-${cycles}`);
    },
    seedBlobPreviewCache(count) {
      const entries = Math.max(0, Math.floor(count));
      for (let i = 0; i < entries; i += 1) {
        const objectUrl = URL.createObjectURL(
          new Blob([`memory-probe-${i}`], { type: "text/plain" }),
        );
        blobPreviewCache.set(`memory-probe-${i}`, objectUrl);
      }
      return blobPreviewCache.size();
    },
    clearBlobPreviewCache() {
      blobPreviewCache.clear();
      return blobPreviewCache.size();
    },
    async logoutSoft() {
      await useAuthStore.getState().logoutSoft();
      store.dispatch(chatApi.util.resetApiState());
      return snapshot("logout-soft");
    },
  };

  return true;
};
