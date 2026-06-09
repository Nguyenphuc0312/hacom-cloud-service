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
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m, index) => {
                if (index !== c.messages.length - 1) return m;
                // Không ghi đè message đã có widget đặc biệt (selector/form)
                if (m.selectionRequest || m.formRequest) return m;
                return {
                  ...m,
                  content: partial ? m.content + content : content,
                  isStreaming: partial,
                };
              }),
              updatedAt: new Date(),
            };
          }),
        }));
      },

      setThinking: (conversationId, thinking) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m, index) =>
                    index === c.messages.length - 1
                      ? { ...m, thinking }
                      : m
                  ),
                }
              : c
          ),
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
            c.id === id ? { ...c, title, updatedAt: new Date() } : c
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
                    title: s.title || existing.title,
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
              // Loại session ẩn danh (anon-*) còn sót từ lúc chưa đăng nhập —
              // chúng không thuộc tài khoản này (backend trả 403 khi fetch).
              !c.serverSessionId.startsWith("anon-") &&
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
          conversations: state.conversations.map((c) =>
            c.id === conversationId && c.messages.length === 0
              ? { ...c, messages: messages.map((m) => ({ ...m, isStreaming: false })) }
              : c
          ),
        }));
      },

      clearStore: () => {
        set({ conversations: [], activeConversationId: null, ownerId: null, lastSessionId: null });
      },
    }),
    {
      name: "hacom-ai-assistant-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Conversations không persist — API là source of truth, tránh stale cache cross-user.
        // Chỉ lưu lastSessionId để restore active conversation sau F5.
        lastSessionId: state.lastSessionId,
        isSidebarOpen: state.isSidebarOpen,
        ownerId: state.ownerId,
        deletedServerSessionIds: state.deletedServerSessionIds,
      }),
    }
  )
);

registerStoreResetter("ai-assistant", () =>
  useAiAssistantStore.getState().clearStore(),
);

