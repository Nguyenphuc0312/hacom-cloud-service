import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AiConversation, AiEndpoint, AiMessage, AiSource } from "../types";
import { registerStoreResetter } from "../../../stores/storeResetRegistry";

interface ServerSessionInput {
  session_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

interface AiAssistantState {
  conversations: AiConversation[];
  activeConversationId: string | null;
  /** employee_code của tài khoản sở hữu dữ liệu (để phát hiện đổi account). */
  ownerId: string | null;
  /** serverSessionId của các session đã xóa — ngăn loadServerSessions khôi phục lại. */
  deletedServerSessionIds: string[];
  /** serverSessionId của session đang active — GIÁ TRỊ DUY NHẤT được persist.
   * Sau F5: dùng để tìm lại conversation đúng sau khi loadServerSessions chạy. */
  lastSessionId: string | null;
  isSidebarOpen: boolean;
  isSourcePanelOpen: boolean;
  selectedSources: AiSource[] | null;

  // Actions
  setActiveConversation: (id: string | null) => void;
  createNewConversation: (endpoint: AiEndpoint) => string;
  addMessage: (conversationId: string, message: AiMessage) => void;
  updateLastMessage: (conversationId: string, content: string, partial?: boolean) => void;
  updateMessage: (conversationId: string, messageId: string, patch: Partial<AiMessage>) => void;
  setThinking: (conversationId: string, thinking: string | undefined) => void;
  deleteConversation: (id: string) => void;
  toggleSidebar: () => void;
  toggleSourcePanel: (open?: boolean) => void;
  setSelectedSources: (sources: AiSource[] | null) => void;
  renameConversation: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
  /** Nạp danh sách session từ backend vào store (giữ messages đã có, clear nếu đổi account). */
  loadServerSessions: (sessions: ServerSessionInput[], endpoint: AiEndpoint, ownerId: string) => void;
  /** Cập nhật serverSessionId sau khi backend trả về session_id mới. */
  updateServerSessionId: (localId: string, serverSessionId: string) => void;
  /** Set ownerId ngay khi biết user (trước cả khi sessions load). */
  setOwnerId: (id: string) => void;
  /** Nạp messages từ server vào conversation (chỉ khi conversation đang rỗng). */
  loadMessagesForConversation: (conversationId: string, messages: AiMessage[]) => void;
  /** Xoá toàn bộ dữ liệu (dùng khi logout hoặc đổi tài khoản). */
  clearStore: () => void;
}

/**
 * localStorage với setItem debounce 800 ms. Store này persist cả nội dung
 * messages, nên nếu ghi đồng bộ theo từng lần set() thì mỗi frame streaming
 * phải JSON.stringify toàn bộ lịch sử — chính là nguồn giật khi session dài.
 * Đọc/xoá vẫn đồng bộ; ghi treo được xả khi tab ẩn/đóng để không mất dữ liệu.
 */
const PERSIST_DEBOUNCE_MS = 800;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending: { key: string; value: string } | null = null;

function writePendingPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!persistPending) return;
  const { key, value } = persistPending;
  persistPending = null;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota đầy / storage bị chặn — bỏ qua, dữ liệu thật vẫn ở backend.
  }
}

const debouncedLocalStorage: Storage = {
  get length() {
    return localStorage.length;
  },
  key: (index) => localStorage.key(index),
  clear: () => {
    persistPending = null;
    localStorage.clear();
  },
  getItem: (key) =>
    persistPending?.key === key ? persistPending.value : localStorage.getItem(key),
  removeItem: (key) => {
    if (persistPending?.key === key) persistPending = null;
    localStorage.removeItem(key);
  },
  setItem: (key, value) => {
    persistPending = { key, value };
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writePendingPersist();
    }, PERSIST_DEBOUNCE_MS);
  },
};

if (typeof window !== "undefined") {
  // pagehide bắt được cả đóng tab lẫn bfcache; visibilitychange lo trường hợp
  // chuyển tab trên mobile (pagehide có thể không bắn).
  window.addEventListener("pagehide", writePendingPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writePendingPersist();
  });
}

/** Patch message cuối của một conversation (giữ nguyên reference các message cũ
 * để React.memo ở MessageRow ăn được). */
function applyLastMessage(
  conversationId: string,
  content: string,
  partial: boolean,
) {
  return (state: AiAssistantState) => ({
    conversations: state.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const lastIndex = c.messages.length - 1;
      const last = c.messages[lastIndex];
      // Không ghi đè message đã có widget đặc biệt (selector/form)
      if (!last || last.selectionRequest || last.formRequest) return c;
      const messages = c.messages.slice();
      messages[lastIndex] = {
        ...last,
        content: partial ? last.content + content : content,
        isStreaming: partial,
      };
      return { ...c, messages, updatedAt: new Date() };
    }),
  });
}

// ── Buffer token streaming: gom token, flush 1 lần/animation frame ──
let pendingConversationId: string | null = null;
let pendingTokens = "";
let pendingFrame: number | null = null;

/** Đẩy buffer vào store ngay lập tức. Gọi khi stream xong/lỗi/huỷ hoặc khi
 * ghi đè content (non-partial) để không mất token còn treo trong buffer. */
export function flushStreamBuffer(): void {
  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }
  if (!pendingConversationId || !pendingTokens) {
    pendingConversationId = null;
    pendingTokens = "";
    return;
  }
  const conversationId = pendingConversationId;
  const chunk = pendingTokens;
  pendingConversationId = null;
  pendingTokens = "";
  useAiAssistantStore.setState(applyLastMessage(conversationId, chunk, true));
}

function bufferStreamToken(conversationId: string, token: string): void {
  // Đổi conversation giữa chừng → xả buffer của cuộc cũ trước, không ghi nhầm.
  if (pendingConversationId && pendingConversationId !== conversationId) {
    flushStreamBuffer();
  }
  pendingConversationId = conversationId;
  pendingTokens += token;
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    flushStreamBuffer();
  });
}

export const useAiAssistantStore = create<AiAssistantState>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
      ownerId: null,
      deletedServerSessionIds: [],
      lastSessionId: null,
      isSidebarOpen: true,
      isSourcePanelOpen: false,
      selectedSources: null as AiSource[] | null,

      setActiveConversation: (id) =>
        set((state) => {
          if (state.activeConversationId === id) return state;
          const conv = id ? state.conversations.find((c) => c.id === id) : null;
          return {
            activeConversationId: id,
            ...(conv?.serverSessionId ? { lastSessionId: conv.serverSessionId } : {}),
          };
        }),

      createNewConversation: (endpoint) => {
        const id = crypto.randomUUID();
        set((state) => {
          const newConv: AiConversation = {
            id,
            title: "Cuộc trò chuyện mới",
            endpoint,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerId: state.ownerId,
          };
          return {
            conversations: [newConv, ...state.conversations],
            activeConversationId: id,
          };
        });
        return id;
      },

      addMessage: (conversationId, message) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, message],
                  updatedAt: new Date(),
                  // Auto rename if it was the first user message
                  title: (c.messages.length === 0 && message.role === "user") 
                    ? (message.content.length > 30 ? message.content.substring(0, 30) + "..." : message.content)
                    : c.title
                }
              : c
          ),
        }));
      },

      updateMessage: (conversationId, messageId, patch) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m
                  ),
                  updatedAt: new Date(),
                }
              : c
          ),
        }));
      },

      updateLastMessage: (conversationId, content, partial = false) => {
        // Streaming token: gom vào buffer, flush 1 lần/frame. Không batch thì mỗi
        // token là 1 set() → re-render toàn danh sách + 1 lần ghi localStorage.
        if (partial) {
          bufferStreamToken(conversationId, content);
          return;
        }
        flushStreamBuffer();
        set(applyLastMessage(conversationId, content, false));
      },

      setThinking: (conversationId, thinking) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const lastIndex = c.messages.length - 1;
            const last = c.messages[lastIndex];
            if (!last || last.thinking === thinking) return c;
            const messages = c.messages.slice();
            messages[lastIndex] = { ...last, thinking };
            return { ...c, messages };
          }),
        }));
      },

      deleteConversation: (id) => {
        set((state) => {
          const conv = state.conversations.find((c) => c.id === id);
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
            ...(conv?.serverSessionId && {
              deletedServerSessionIds: [...state.deletedServerSessionIds, conv.serverSessionId],
            }),
          };
        });
      },

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      
      toggleSourcePanel: (open) => set((state) => ({ 
        isSourcePanelOpen: open !== undefined ? open : !state.isSourcePanelOpen 
      })),

      setSelectedSources: (sources) => set({ selectedSources: sources }),

      renameConversation: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title, titleRenamed: true, updatedAt: new Date() } : c
          ),
        }));
      },

      togglePinConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isPinned: !c.isPinned } : c
          ),
        }));
      },

      loadServerSessions: (sessions, endpoint, ownerId) => {
        set((state) => {
          const isCurrentOwner = (c: AiConversation) =>
            !c.ownerId || c.ownerId === ownerId;

          // Chỉ tra cứu conversations thuộc tài khoản hiện tại cho endpoint này
          const existingByServerId = new Map<string, AiConversation>();
          for (const c of state.conversations) {
            if (c.endpoint === endpoint && c.serverSessionId && isCurrentOwner(c)) {
              existingByServerId.set(c.serverSessionId, c);
            }
          }

          const deletedIds = new Set(state.deletedServerSessionIds);
          const serverIds = new Set(sessions.map((s) => s.session_id));

          // Also index by local id to handle conversations whose id was previously set
          // to a session_id (legacy behaviour). This prevents duplicates when the backend
          // creates a double-prefixed session — both session ids would otherwise resolve
          // to the same local id, producing two sidebar entries.
          const existingByLocalId = new Map<string, AiConversation>();
          for (const c of state.conversations) {
            if (c.endpoint === endpoint && isCurrentOwner(c)) {
              existingByLocalId.set(c.id, c);
            }
          }

          const serverConvsMap = new Map<string, AiConversation>();
          for (const s of sessions.filter((ss) => !deletedIds.has(ss.session_id))) {
            const existing = existingByServerId.get(s.session_id)
              ?? existingByLocalId.get(s.session_id);
            const convId = existing ? existing.id : s.session_id;
            const alreadyHas = serverConvsMap.has(convId);
            if (!alreadyHas || existing) {
              serverConvsMap.set(convId, existing
                ? {
                    ...existing,
                    serverSessionId: s.session_id,
                    // Giữ tên user tự đặt (titleRenamed) kể cả khi BE trả tên cũ
                    // — tránh reload là mất rename khi BE chưa lưu.
                    title: existing.titleRenamed
                      ? existing.title
                      : s.title || existing.title,
                    updatedAt: s.updated_at ? new Date(s.updated_at) : existing.updatedAt,
                    ownerId,
                  }
                : {
                    id: s.session_id,
                    title: s.title || "Cuộc trò chuyện",
                    endpoint,
                    messages: [],
                    createdAt: s.created_at ? new Date(s.created_at) : new Date(),
                    updatedAt: s.updated_at ? new Date(s.updated_at) : new Date(),
                    serverSessionId: s.session_id,
                    ownerId,
                  },
              );
            }
          }
          const serverConvs = Array.from(serverConvsMap.values());

          // Conversation của tài khoản hiện tại CÓ serverSessionId nhưng server KHÔNG
          // trả về (danh sách server có thể thiếu/lỗi network) — GIỮ LẠI, chỉ loại khi
          // nằm trong blacklist (đã xóa). Đây là nguồn DUY NHẤT để xóa, tránh mất dữ liệu.
          const localWithServerId = state.conversations.filter(
            (c) =>
              c.endpoint === endpoint &&
              c.serverSessionId &&
              isCurrentOwner(c) &&
              // Chỉ loại session ẩn danh (anon-*) RỖNG — artefact còn sót từ lúc
              // chưa đăng nhập (không thuộc tài khoản, backend trả 403 khi fetch).
              // GIỮ LẠI session anon ĐÃ CÓ tin nhắn thật: đó là hội thoại đã trả
              // lời xong mà backend trả session_id ẩn danh — nếu lọc luôn thì sau
              // F5 hội thoại biến mất (chỉ khi bấm Dừng mới còn vì không có
              // serverSessionId). Tin nhắn đã persist sẵn nên không cần fetch lại.
              !(c.serverSessionId.startsWith("anon-") && c.messages.length === 0) &&
              !serverIds.has(c.serverSessionId) &&
              !deletedIds.has(c.serverSessionId),
          );

          // Local-only của tài khoản hiện tại (chưa có serverSessionId)
          const localOnly = state.conversations.filter(
            (c) => c.endpoint === endpoint && !c.serverSessionId && isCurrentOwner(c),
          );

          // Giữ nguyên conversations của tài khoản khác hoặc endpoint khác
          const preserved = state.conversations.filter(
            (c) =>
              c.endpoint !== endpoint ||
              (c.ownerId != null && c.ownerId !== ownerId),
          );

          const merged = [...serverConvs, ...localWithServerId, ...localOnly, ...preserved];

          // activeConversationId chỉ giữ nếu thuộc tài khoản hiện tại
          const currentOwnerIds = new Set(
            [...serverConvs, ...localWithServerId, ...localOnly].map((c) => c.id),
          );
          const activeIsCurrentOwner =
            !!state.activeConversationId &&
            currentOwnerIds.has(state.activeConversationId);

          // Restore theo lastSessionId nếu active hiện tại không còn hợp lệ
          const restoredConv = !activeIsCurrentOwner && state.lastSessionId
            ? [...serverConvs, ...localWithServerId].find(
                (c) => c.serverSessionId === state.lastSessionId || c.id === state.lastSessionId,
              )
            : null;

          return {
            conversations: merged,
            ownerId,
            activeConversationId: activeIsCurrentOwner
              ? state.activeConversationId
              : (restoredConv?.id ?? serverConvs[0]?.id ?? localWithServerId[0]?.id ?? localOnly[0]?.id ?? null),
          };
        });
      },

      updateServerSessionId: (localId, serverSessionId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === localId ? { ...c, serverSessionId } : c,
          ),
          ...(state.activeConversationId === localId && { lastSessionId: serverSessionId }),
        }));
      },

      setOwnerId: (id) => set({ ownerId: id }),

      loadMessagesForConversation: (conversationId, messages) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const incoming = messages.map((m) => ({ ...m, isStreaming: false }));
            if (c.messages.length === 0) return { ...c, messages: incoming };
            // Đã có message trên máy: chỉ nhận phần LỊCH SỬ CŨ HƠN chưa biết
            // (trang trước từ pagination), giữ nguyên phần đang hiển thị để
            // không đụng vào message đang stream và không phá memo của row.
            const known = new Set(c.messages.map((m) => m.id));
            const older = incoming.filter((m) => !known.has(m.id));
            if (older.length === 0) return c;
            return { ...c, messages: [...older, ...c.messages] };
          }),
        }));
      },

      clearStore: () => {
        set({ conversations: [], activeConversationId: null, ownerId: null, lastSessionId: null });
      },
    }),
    {
      name: "hacom-ai-assistant-storage",
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (state) => ({
        // Persist conversations (kèm messages) để hiển thị ngay khi F5 / navigate
        // lại mà không cần chờ API — cùng pattern với personalAiStore.
        // loadServerSessions vẫn chạy sau đó để merge dữ liệu mới nhất từ server.
        conversations: state.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            sources: m.sources,
            isError: m.isError,
            isStreaming: false,
            // formRequest / selectionRequest / thinking là UI-only, không persist
          })),
        })),
        lastSessionId: state.lastSessionId,
        isSidebarOpen: state.isSidebarOpen,
        ownerId: state.ownerId,
        deletedServerSessionIds: state.deletedServerSessionIds,
      }),
      // v1: dọn dữ liệu di sản. Trước khi BE sinh session_id riêng (UUID), mọi
      // hội thoại company bị gộp chung serverSessionId `chat-{user}-default`.
      // Những bản ghi đó không tách lại được (BE đã gộp lịch sử) và gây
      // merge/mất khi loadServerSessions chạy → xóa 1 lần khỏi localStorage.
      version: 1,
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as { conversations?: AiConversation[] } | undefined;
        if (!state || !Array.isArray(state.conversations)) return state as never;
        if (fromVersion < 1) {
          state.conversations = state.conversations.filter(
            (c) =>
              !(
                c.endpoint === "company" &&
                typeof c.serverSessionId === "string" &&
                c.serverSessionId.endsWith("-default")
              ),
          );
        }
        return state as never;
      },
    }
  )
);

registerStoreResetter("ai-assistant", () =>
  useAiAssistantStore.getState().clearStore(),
);

