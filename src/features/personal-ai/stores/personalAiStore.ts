import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PersonalDocument, PersonalChatMessage } from "../types";

interface PersonalWorkspaceConversation {
  id: string;
  title: string;
  messages: PersonalChatMessage[];
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  /** Session ID do backend cấp. null = chưa gửi message nào lên backend. */
  serverSessionId?: string | null;
  /** employee_code/id của tài khoản sở hữu conversation này. */
  ownerId?: string | null;
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

  // Conversations
  conversations: PersonalWorkspaceConversation[];
  activeConversationId: string | null;
  /** employee_code của tài khoản sở hữu dữ liệu trong store (để phát hiện đổi account). */
  ownerId: string | null;
  /** serverSessionId của các session đã xóa — ngăn loadServerSessions khôi phục lại. */
  deletedServerSessionIds: string[];

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
  /** Nạp danh sách session từ backend vào store (giữ messages đã có, clear nếu đổi account). */
  loadServerSessions: (sessions: ServerSessionInput[], ownerId: string) => void;
  /** Cập nhật serverSessionId sau khi backend trả về session_id mới. */
  updateServerSessionId: (localId: string, serverSessionId: string) => void;
  /** Set ownerId ngay khi biết user (trước cả khi sessions load). */
  setOwnerId: (id: string) => void;
  /** Xoá toàn bộ dữ liệu (dùng khi logout hoặc đổi tài khoản). */
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
      deletedServerSessionIds: [],
      isSourcePanelOpen: false,

      toggleSourcePanel: () =>
        set((s) => ({ isSourcePanelOpen: !s.isSourcePanelOpen })),

      setDocuments: (docs) =>
        set((s) => {
          const docIds = new Set(docs.map((d) => d.id));
          return {
            documents: docs,
            // Loại bỏ các selection trỏ tới doc không còn trong session hiện tại
            // (tránh leak doc từ conversation cũ sang query mới qua localStorage).
            selectedDocumentIds: s.selectedDocumentIds.filter((id) =>
              docIds.has(id),
            ),
          };
        }),

      addDocument: (doc) =>
        set((s) => ({
          documents: [doc, ...s.documents],
          // Auto-select newly uploaded document
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
        set((s) =>
          s.activeConversationId === id
            ? s
            : {
                activeConversationId: id,
                // Mỗi hội thoại có nguồn riêng — dọn doc + selection của session
                // cũ ngay khi đổi để panel không "leak" tài liệu sang hội thoại
                // khác. loadDocuments sẽ nạp lại đúng tài liệu của session này.
                documents: [],
                selectedDocumentIds: [],
                documentsLoaded: false,
              },
        ),

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
            },
            ...s.conversations,
          ],
          activeConversationId: id,
          // Conversation mới chưa có nguồn nào — dọn cả danh sách tài liệu lẫn
          // selection của session cũ để không "leak" nguồn sang hội thoại mới
          // (loadDocuments sẽ nạp lại đúng tài liệu của session này).
          selectedDocumentIds: [],
          documents: [],
        }));
        return id;
      },

      deleteConversation: (id) =>
        set((s) => {
          const conv = s.conversations.find((c) => c.id === id);
          const isActive = s.activeConversationId === id;
          return {
            conversations: s.conversations.filter((c) => c.id !== id),
            activeConversationId: isActive
              ? s.conversations.find((c) => c.id !== id)?.id ?? null
              : s.activeConversationId,
            // Ghi nhớ serverSessionId đã xóa để loadServerSessions không khôi phục lại
            ...(conv?.serverSessionId && {
              deletedServerSessionIds: [...s.deletedServerSessionIds, conv.serverSessionId],
            }),
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
          const isCurrentOwner = (c: PersonalWorkspaceConversation) =>
            !c.ownerId || c.ownerId === ownerId;

          // Chỉ tra cứu conversations thuộc tài khoản hiện tại
          const existingByServerId = new Map<string, PersonalWorkspaceConversation>();
          for (const c of s.conversations) {
            if (c.serverSessionId && isCurrentOwner(c)) {
              existingByServerId.set(c.serverSessionId, c);
            }
          }

          const deletedIds = new Set(s.deletedServerSessionIds);
          const serverIds = new Set(sessions.map((session) => session.session_id));
          const serverConvs: PersonalWorkspaceConversation[] = sessions
            .filter((session) => !deletedIds.has(session.session_id))
            .map((session) => {
              const existing = existingByServerId.get(session.session_id);
              if (existing) {
                return {
                  ...existing,
                  title: session.title || existing.title,
                  updatedAt: session.updated_at || existing.updatedAt,
                  ownerId,
                };
              }
              const now = new Date().toISOString();
              return {
                id: session.session_id,
                title: session.title || "Cuộc trò chuyện",
                messages: [],
                createdAt: session.created_at || now,
                updatedAt: session.updated_at || now,
                serverSessionId: session.session_id,
                ownerId,
              };
            });

          // Conversation của tài khoản hiện tại CÓ serverSessionId nhưng server KHÔNG
          // trả về (danh sách server có thể thiếu/lỗi network) — GIỮ LẠI, chỉ loại khi
          // nằm trong blacklist (đã xóa). Đây là nguồn DUY NHẤT để xóa, tránh mất dữ liệu.
          const localWithServerId = s.conversations.filter(
            (c) =>
              c.serverSessionId &&
              isCurrentOwner(c) &&
              !serverIds.has(c.serverSessionId) &&
              !deletedIds.has(c.serverSessionId),
          );

          // Local-only của tài khoản hiện tại
          const localOnly = s.conversations.filter(
            (c) => !c.serverSessionId && isCurrentOwner(c),
          );

          // Giữ nguyên conversations của tài khoản khác
          const preserved = s.conversations.filter(
            (c) => c.ownerId != null && c.ownerId !== ownerId,
          );

          const merged = [...serverConvs, ...localWithServerId, ...localOnly, ...preserved];

          // activeConversationId chỉ giữ nếu thuộc tài khoản hiện tại
          const currentOwnerIds = new Set(
            [...serverConvs, ...localWithServerId, ...localOnly].map((c) => c.id),
          );
          const activeIsCurrentOwner =
            !!s.activeConversationId && currentOwnerIds.has(s.activeConversationId);
          const newActiveId = activeIsCurrentOwner
            ? s.activeConversationId
            : (serverConvs[0]?.id ?? localWithServerId[0]?.id ?? localOnly[0]?.id ?? null);
          const didSwitch = newActiveId !== s.activeConversationId;

          return {
            conversations: merged,
            activeConversationId: newActiveId,
            ownerId,
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
            c.id === localId ? { ...c, serverSessionId } : c,
          ),
        }));
      },

      setOwnerId: (id) => set({ ownerId: id }),

      clearStore: () => {
        set({
          conversations: [],
          activeConversationId: null,
          ownerId: null,
          documents: [],
          selectedDocumentIds: [],
          documentsLoaded: false,
        });
      },
    }),
    {
      name: "hacom-personal-ai-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedDocumentIds: s.selectedDocumentIds,
        conversations: s.conversations,
        activeConversationId: s.activeConversationId,
        ownerId: s.ownerId,
        deletedServerSessionIds: s.deletedServerSessionIds,
      }),
    },
  ),
);

