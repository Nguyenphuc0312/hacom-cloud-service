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
}

interface PersonalAiState {
  // Documents (knowledge sources)
  documents: PersonalDocument[];
  selectedDocumentIds: string[];
  documentsLoaded: boolean;

  // Conversations
  conversations: PersonalWorkspaceConversation[];
  activeConversationId: string | null;

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
  renameConversation: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
}

export const usePersonalAiStore = create<PersonalAiState>()(
  persist(
    (set) => ({
      documents: [],
      selectedDocumentIds: [],
      documentsLoaded: false,
      conversations: [],
      activeConversationId: null,
      isSourcePanelOpen: true,

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

      setActiveConversation: (id) => set({ activeConversationId: id }),

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
            },
            ...s.conversations,
          ],
          activeConversationId: id,
        }));
        return id;
      },

      deleteConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeConversationId:
            s.activeConversationId === id
              ? s.conversations.find((c) => c.id !== id)?.id ?? null
              : s.activeConversationId,
        })),

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
    }),
    {
      name: "hacom-personal-ai-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedDocumentIds: s.selectedDocumentIds,
        conversations: s.conversations,
        activeConversationId: s.activeConversationId,
      }),
    },
  ),
);
