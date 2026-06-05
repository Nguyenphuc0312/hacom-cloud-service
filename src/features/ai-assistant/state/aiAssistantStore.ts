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
  /** Xoá toàn bộ dữ liệu (dùng khi logout hoặc đổi tài khoản). */
  clearStore: () => void;
}

export const useAiAssistantStore = create<AiAssistantState>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
      ownerId: null,
      isSidebarOpen: true,
      isSourcePanelOpen: false,
      selectedSources: null as AiSource[] | null,

      setActiveConversation: (id) => set({ activeConversationId: id }),

      createNewConversation: (endpoint) => {
        const id = crypto.randomUUID();
        const newConv: AiConversation = {
          id,
          title: "Cuộc trò chuyện mới",
          endpoint,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({
          conversations: [newConv, ...state.conversations],
          activeConversationId: id,
        }));
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
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        }));
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
          // Đổi tài khoản trên cùng máy → xoá hết conversations của endpoint này
          const isNewOwner = !!state.ownerId && state.ownerId !== ownerId;
          const baseConversations = isNewOwner
            ? state.conversations.filter((c) => c.endpoint !== endpoint)
            : state.conversations;

          const existingByServerId = new Map<string, AiConversation>();
          for (const c of baseConversations) {
            if (c.endpoint === endpoint && c.serverSessionId) {
              existingByServerId.set(c.serverSessionId, c);
            }
          }

          const serverConvs: AiConversation[] = sessions.map((s) => {
            const existing = existingByServerId.get(s.session_id);
            if (existing) {
              return {
                ...existing,
                title: s.title || existing.title,
                updatedAt: s.updated_at ? new Date(s.updated_at) : existing.updatedAt,
              };
            }
            return {
              id: s.session_id,
              title: s.title || "Cuộc trò chuyện",
              endpoint,
              messages: [],
              createdAt: s.created_at ? new Date(s.created_at) : new Date(),
              updatedAt: s.updated_at ? new Date(s.updated_at) : new Date(),
              serverSessionId: s.session_id,
            };
          });

          const localOnly = baseConversations.filter(
            (c) => c.endpoint === endpoint && !c.serverSessionId,
          );
          const otherEndpoints = baseConversations.filter(
            (c) => c.endpoint !== endpoint,
          );

          const merged = [...serverConvs, ...localOnly, ...otherEndpoints];
          const activeExists = merged.some((c) => c.id === state.activeConversationId);

          return {
            conversations: merged,
            ownerId,
            activeConversationId: activeExists
              ? state.activeConversationId
              : (serverConvs[0]?.id ?? state.activeConversationId),
          };
        });
      },

      updateServerSessionId: (localId, serverSessionId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === localId ? { ...c, serverSessionId } : c,
          ),
        }));
      },

      clearStore: () => {
        set({ conversations: [], activeConversationId: null, ownerId: null });
      },
    }),
    {
      name: "hacom-ai-assistant-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        isSidebarOpen: state.isSidebarOpen,
        ownerId: state.ownerId,
      }),
    }
  )
);

registerStoreResetter("ai-assistant", () => {
  useAiAssistantStore.getState().clearStore();
});
