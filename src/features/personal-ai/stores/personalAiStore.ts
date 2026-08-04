import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PersonalDocument, PersonalChatMessage } from "../types";
import { registerStoreResetter } from "../../../stores/storeResetRegistry";

interface PersonalWorkspaceConversation {
  id: string;
  title: string;
  messages: PersonalChatMessage[];
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  /** Session ID do backend cấp. undefined = chưa gửi message nào lên backend. */
  serverSessionId?: string | null;
  /** employee_code/id của tài khoản sở hữu conversation này. */
  ownerId?: string | null;
  /** Đánh dấu conversation được tạo mới bằng nút "+", chưa được backend xác nhận.
   * Đảm bảo new_conversation: true luôn được gửi trên tin nhắn đầu tiên. */
  pendingNew?: boolean;
}

interface ServerSessionInput {
  session_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

interface PersonalAiState {
  // Documents (knowledge sources)
  documents: PersonalDocument[];
  selectedDocumentIds: string[];
  documentsLoaded: boolean;

  // Conversations — in-memory only, source of truth = API.
  // localStorage chỉ lưu lastSessionId để restore sau F5.
  conversations: PersonalWorkspaceConversation[];
  activeConversationId: string | null;
  ownerId: string | null;
  /** True sau khi loadServerSessions chạy lần đầu — dùng để hiển thị loading state. */
  sessionsLoaded: boolean;
  /** serverSessionId của session đang active — GIÁ TRỊ DUY NHẤT được persist vào localStorage.
   * Sau F5: đọc giá trị này, tìm trong danh sách sessions từ API, nếu còn tồn tại thì restore. */
  lastSessionId: string | null;

  // UI
  isSourcePanelOpen: boolean;
  toggleSourcePanel: () => void;

  // Actions — documents
  setDocuments: (docs: PersonalDocument[]) => void;
  addDocument: (doc: PersonalDocument) => void;
  updateDocument: (id: string, partial: Partial<PersonalDocument>) => void;
  removeDocument: (id: string) => void;
  toggleDocumentSelection: (id: string) => void;
  setSelectedDocumentIds: (ids: string[]) => void;
  selectAllDocuments: () => void;
  deselectAllDocuments: () => void;
  setDocumentsLoaded: (loaded: boolean) => void;

  // Actions — conversations
  setActiveConversation: (id: string | null) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, message: PersonalChatMessage) => void;
  appendToken: (conversationId: string, token: string) => void;
  finalizeMessage: (
    conversationId: string,
    content: string,
    citations?: PersonalChatMessage["citations"],
  ) => void;
  setMessageThinkingPhase: (
    conversationId: string,
    phase: PersonalChatMessage["thinkingPhase"],
  ) => void;
  markMessageError: (conversationId: string) => void;
  patchMessage: (conversationId: string, messageId: string, patch: Partial<PersonalChatMessage>) => void;
  renameConversation: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
  /** Nạp danh sách session từ API vào store.
   * API là source of truth — danh sách cũ bị thay hoàn toàn bởi kết quả mới.
   * In-memory messages được giữ lại cho session nào đã load rồi. */
  loadServerSessions: (sessions: ServerSessionInput[], ownerId: string) => void;
  /** Cập nhật serverSessionId sau khi backend trả về session_id mới. */
  updateServerSessionId: (localId: string, serverSessionId: string) => void;
  /** Set ownerId ngay khi biết user (trước cả khi sessions load). */
  setOwnerId: (id: string) => void;
  /** Nạp messages từ server vào conversation (chỉ khi conversation đang rỗng). */
  loadMessagesForConversation: (conversationId: string, messages: PersonalChatMessage[]) => void;
  /** Xoá toàn bộ dữ liệu (dùng khi logout). */
  clearStore: () => void;
}

export const usePersonalAiStore = create<PersonalAiState>()(
  persist(
    (set) => ({
      documents: [],
      selectedDocumentIds: [],
      documentsLoaded: false,
      conversations: [],
      activeConversationId: null,
      ownerId: null,
      sessionsLoaded: false,
      lastSessionId: null,
      isSourcePanelOpen: false,

      toggleSourcePanel: () =>
        set((s) => ({ isSourcePanelOpen: !s.isSourcePanelOpen })),

      setDocuments: (docs) =>
        set((s) => {
          const docIds = new Set(docs.map((d) => d.id));
          return {
            documents: docs,
            selectedDocumentIds: s.selectedDocumentIds.filter((id) =>
              docIds.has(id),
            ),
          };
        }),

      addDocument: (doc) =>
        set((s) => ({
          documents: [doc, ...s.documents],
          selectedDocumentIds: [...s.selectedDocumentIds, doc.id],
        })),

      updateDocument: (id, partial) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, ...partial } : d,
          ),
        })),

      removeDocument: (id) =>
        set((s) => ({
          documents: s.documents.filter((d) => d.id !== id),
          selectedDocumentIds: s.selectedDocumentIds.filter((sid) => sid !== id),
        })),

      toggleDocumentSelection: (id) =>
        set((s) => {
          const selected = s.selectedDocumentIds.includes(id);
          return {
            selectedDocumentIds: selected
              ? s.selectedDocumentIds.filter((sid) => sid !== id)
              : [...s.selectedDocumentIds, id],
          };
        }),

      setSelectedDocumentIds: (ids) => set({ selectedDocumentIds: ids }),

      selectAllDocuments: () =>
        set((s) => ({
          selectedDocumentIds: s.documents.map((d) => d.id),
        })),

      deselectAllDocuments: () => set({ selectedDocumentIds: [] }),

      setDocumentsLoaded: (loaded) => set({ documentsLoaded: loaded }),

      setActiveConversation: (id) =>
        set((s) => {
          if (s.activeConversationId === id) return s;
          const conv = id ? s.conversations.find((c) => c.id === id) : null;
          return {
            activeConversationId: id,
            // Persist serverSessionId để restore sau F5
            ...(conv?.serverSessionId
              ? { lastSessionId: conv.serverSessionId }
              : {}),
            // Dọn doc + selection của session cũ khi đổi hội thoại
            documents: [],
            selectedDocumentIds: [],
            documentsLoaded: false,
          };
        }),

      createConversation: () => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        set((s) => ({
          conversations: [
            {
              id,
              title: "Cuộc trò chuyện mới",
              messages: [],
              createdAt: now,
              updatedAt: now,
              ownerId: s.ownerId,
              pendingNew: true,
            },
            ...s.conversations,
          ],
          activeConversationId: id,
          selectedDocumentIds: [],
          documents: [],
          documentsLoaded: false,
        }));
        return id;
      },

      deleteConversation: (id) =>
        set((s) => {
          const isActive = s.activeConversationId === id;
          const remaining = s.conversations.filter((c) => c.id !== id);
          return {
            conversations: remaining,
            activeConversationId: isActive
              ? remaining[0]?.id ?? null
              : s.activeConversationId,
            ...(isActive && {
              documents: [],
              selectedDocumentIds: [],
              documentsLoaded: false,
            }),
          };
        }),

      addMessage: (conversationId, message) => {
        const now = new Date().toISOString();
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const title =
              c.messages.length === 0 && message.role === "user"
                ? message.content.length > 40
                  ? message.content.slice(0, 40) + "…"
                  : message.content
                : c.title;
            return {
              ...c,
              title,
              messages: [...c.messages, message],
              updatedAt: now,
            };
          }),
        }));
      },

      appendToken: (conversationId, token) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (!last || last.role !== "assistant") return c;
            messages[messages.length - 1] = {
              ...last,
              content: last.content + token,
              isStreaming: true,
            };
            return { ...c, messages };
          }),
        }));
      },

      finalizeMessage: (conversationId, content, citations) => {
        const now = new Date().toISOString();
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (!last || last.role !== "assistant") return c;
            messages[messages.length - 1] = {
              ...last,
              content,
              citations,
              isStreaming: false,
              thinkingPhase: null,
            };
            return { ...c, messages, updatedAt: now };
          }),
        }));
      },

      setMessageThinkingPhase: (conversationId, phase) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (!last || last.role !== "assistant") return c;
            messages[messages.length - 1] = { ...last, thinkingPhase: phase };
            return { ...c, messages };
          }),
        }));
      },

      markMessageError: (conversationId) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (!last) return c;
            messages[messages.length - 1] = {
              ...last,
              isError: true,
              isStreaming: false,
              thinkingPhase: null,
            };
            return { ...c, messages };
          }),
        }));
      },

      patchMessage: (conversationId, messageId, patch) => {
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m,
              ),
            };
          }),
        }));
      },

      renameConversation: (id, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title } : c,
          ),
        })),

      togglePinConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, isPinned: !c.isPinned } : c,
          ),
        })),

      loadServerSessions: (sessions, ownerId) => {
        set((s) => {
          // Giữ lại in-memory messages cho session đã load — tránh mất chat đang hiển thị.
          const inMemoryByServerId = new Map<string, PersonalWorkspaceConversation>();
          for (const c of s.conversations) {
            if (c.serverSessionId) inMemoryByServerId.set(c.serverSessionId, c);
          }

          const now = new Date().toISOString();
          // API là source of truth — xây danh sách mới hoàn toàn từ server response.
          const serverConvs = sessions.map((session): PersonalWorkspaceConversation => {
            const existing = inMemoryByServerId.get(session.session_id);
            return existing
              ? {
                  ...existing,
                  title: session.title || existing.title,
                  updatedAt: session.updated_at || existing.updatedAt,
                  ownerId,
                }
              : {
                  id: session.session_id,
                  title: session.title || "Cuộc trò chuyện",
                  messages: [],
                  createdAt: session.created_at || now,
                  updatedAt: session.updated_at || now,
                  serverSessionId: session.session_id,
                  ownerId,
                };
          });

          // Giữ lại conversation đang được tạo mới (chưa có serverSessionId)
          const localOnly = s.conversations.filter(
            (c) => c.pendingNew && !c.serverSessionId,
          );

          const merged = [...localOnly, ...serverConvs];

          // Restore active session:
          // 1. Nếu active hiện tại còn trong list mới → giữ nguyên
          // 2. Nếu không → tìm theo lastSessionId (restore sau F5)
          // 3. Fallback → session đầu tiên trong list
          const currentStillExists = s.activeConversationId
            ? merged.some((c) => c.id === s.activeConversationId)
            : false;
          const restoredConv = !currentStillExists && s.lastSessionId
            ? merged.find(
                (c) => c.serverSessionId === s.lastSessionId || c.id === s.lastSessionId,
              )
            : null;
          const newActiveId = currentStillExists
            ? s.activeConversationId
            : (restoredConv?.id ?? localOnly[0]?.id ?? serverConvs[0]?.id ?? null);
          const didSwitch = newActiveId !== s.activeConversationId;

          return {
            conversations: merged,
            activeConversationId: newActiveId,
            ownerId,
            sessionsLoaded: true,
            ...(didSwitch && {
              documents: [],
              selectedDocumentIds: [],
              documentsLoaded: false,
            }),
          };
        });
      },

      updateServerSessionId: (localId, serverSessionId) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === localId ? { ...c, serverSessionId, pendingNew: false } : c,
          ),
          // Sync lastSessionId khi active conversation nhận serverSessionId mới
          ...(s.activeConversationId === localId && { lastSessionId: serverSessionId }),
        }));
      },

      setOwnerId: (id) => set({ ownerId: id }),

      loadMessagesForConversation: (conversationId, messages) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId && c.messages.length === 0
              ? {
                  ...c,
                  messages: messages.map((m) => ({
                    ...m,
                    isStreaming: false,
                    thinkingPhase: null,
                  })),
                }
              : c,
          ),
        }));
      },

      clearStore: () => {
        set({
          conversations: [],
          activeConversationId: null,
          ownerId: null,
          sessionsLoaded: false,
          lastSessionId: null,
          documents: [],
          selectedDocumentIds: [],
          documentsLoaded: false,
        });
      },
    }),
    {
      name: "hacom-personal-ai-workspace",
      storage: createJSONStorage(() => localStorage),
      // Chỉ lưu lastSessionId để restore session sau F5.
      // selectedDocumentIds KHÔNG persist — scope theo từng hội thoại, hội thoại
      // mới phải bắt đầu không có nguồn nào (Quy tắc 2 contract NotebookLM).
      // conversations KHÔNG persist — API là source of truth, stale cache gây lỗi cross-user.
      partialize: (s) => ({
        lastSessionId: s.lastSessionId,
      }),
    },
  ),
);

registerStoreResetter("personal-ai", () =>
  usePersonalAiStore.getState().clearStore(),
);
