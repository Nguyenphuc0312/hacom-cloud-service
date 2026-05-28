import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AiConversation, AiEndpoint, AiMessage, AiSource } from "../types";

interface AiAssistantState {
  conversations: AiConversation[];
  activeConversationId: string | null;
  isSidebarOpen: boolean;
  isSourcePanelOpen: boolean;
  selectedSources: AiSource[] | null;

  // Actions
  setActiveConversation: (id: string | null) => void;
  createNewConversation: (endpoint: AiEndpoint) => string;
  addMessage: (conversationId: string, message: AiMessage) => void;
  updateLastMessage: (conversationId: string, content: string, partial?: boolean) => void;
  setThinking: (conversationId: string, thinking: string | undefined) => void;
  deleteConversation: (id: string) => void;
  toggleSidebar: () => void;
  toggleSourcePanel: (open?: boolean) => void;
  setSelectedSources: (sources: AiSource[] | null) => void;
  renameConversation: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
}

export const useAiAssistantStore = create<AiAssistantState>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
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

      updateLastMessage: (conversationId, content, partial = false) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m, index) =>
                    index === c.messages.length - 1
                      ? { ...m, content: partial ? m.content + content : content, isStreaming: partial }
                      : m
                  ),
                  updatedAt: new Date(),
                }
              : c
          ),
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
    }),
    {
      name: "hacom-ai-assistant-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        isSidebarOpen: state.isSidebarOpen,
      }),
    }
  )
);
