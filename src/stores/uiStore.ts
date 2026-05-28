/**
 * @fileoverview UI Store (Zustand)
 * Quản lý state cho UI components: modals, toasts, sidebars, themes
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ============================================
// TYPES
// ============================================

export type Theme = "light" | "dark" | "system";
export type ThemeBrand = "blue" | "green" | "purple";
export type ChatDensity = "auto" | "comfortable" | "compact" | "expanded";
export type ModalType =
  | "createGroup"
  | "editProfile"
  | "settings"
  | "members"
  | "forward"
  | "imagePreview"
  | "deleteConfirm"
  | "newChat"
  | "userProfile"
  | null;

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ModalData {
  imageUrl?: string;
  userId?: string;
  messageId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

interface UIState {
  // Theme
  theme: Theme;
  brand: ThemeBrand;
  setTheme: (theme: Theme) => void;
  setBrand: (brand: ThemeBrand) => void;

  // Sidebar
  isSidebarCollapsed: boolean;
  isInfoPanelOpen: boolean;
  toggleSidebar: () => void;
  toggleInfoPanel: () => void;
  setInfoPanelOpen: (open: boolean) => void;

  // Mobile
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;

  // Modal
  activeModal: ModalType;
  modalData: ModalData | null;
  openModal: (type: ModalType, data?: ModalData) => void;
  closeModal: () => void;

  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  // Loading overlays
  isGlobalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;

  // Chat density
  chatDensity: ChatDensity;
  setChatDensity: (density: ChatDensity) => void;
  toggleChatDensity: () => void;

  // Message selection
  isMessageSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  selectAllMessages: (messageIds: string[]) => void;
  clearMessageSelection: () => void;

  // Keyboard shortcuts
  isKeyboardShortcutsOpen: boolean;
  toggleKeyboardShortcuts: () => void;

  // Pinned conversations (client-side, persisted)
  pinnedConversationIds: string[];
  togglePinnedConversation: (conversationId: string) => void;
}

// ============================================
// STORE
// ============================================

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // ============================================
      // THEME
      // ============================================
      theme: "system",
      brand: "blue",
      setTheme: (theme) => {
        set({ theme });
      },
      setBrand: (brand) => {
        set({ brand });
      },

      // ============================================
      // SIDEBAR
      // ============================================
      isSidebarCollapsed: false,
      isInfoPanelOpen: false,

      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
      },

      toggleInfoPanel: () => {
        set((state) => ({ isInfoPanelOpen: !state.isInfoPanelOpen }));
      },

      setInfoPanelOpen: (open) => {
        set({ isInfoPanelOpen: open });
      },

      // ============================================
      // MOBILE
      // ============================================
      isMobileMenuOpen: false,

      setMobileMenuOpen: (open) => {
        set({ isMobileMenuOpen: open });
      },

      // ============================================
      // MODAL
      // ============================================
      activeModal: null,
      modalData: null,

      openModal: (type, data) => {
        set({ activeModal: type, modalData: data ?? null });
      },

      closeModal: () => {
        set({ activeModal: null, modalData: null });
      },

      // ============================================
      // TOASTS
      // ============================================
      toasts: [],

      addToast: (toast) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }],
        }));

        // Auto remove after duration
        const duration = toast.duration ?? 3000;
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, duration);
        }
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      clearToasts: () => {
        set({ toasts: [] });
      },

      // ============================================
      // LOADING
      // ============================================
      isGlobalLoading: false,

      setGlobalLoading: (loading) => {
        set({ isGlobalLoading: loading });
      },

      // ============================================
      // CHAT DENSITY
      // ============================================
      chatDensity: "auto",

      setChatDensity: (density) => {
        set({ chatDensity: density });
      },

      toggleChatDensity: () => {
        const densityOrder: ChatDensity[] = [
          "auto",
          "comfortable",
          "compact",
          "expanded",
        ];
        set((state) => ({
          chatDensity:
            densityOrder[
              (densityOrder.indexOf(state.chatDensity) + 1) %
                densityOrder.length
            ],
        }));
      },

      // ============================================
      // MESSAGE SELECTION
      // ============================================
      isMessageSelectionMode: false,
      selectedMessageIds: new Set<string>(),

      enterSelectionMode: () => {
        set({
          isMessageSelectionMode: true,
          selectedMessageIds: new Set<string>(),
        });
      },

      exitSelectionMode: () => {
        set({
          isMessageSelectionMode: false,
          selectedMessageIds: new Set<string>(),
        });
      },

      toggleMessageSelection: (messageId) => {
        set((state) => {
          const next = new Set(state.selectedMessageIds);
          if (next.has(messageId)) {
            next.delete(messageId);
          } else {
            next.add(messageId);
          }
          return { selectedMessageIds: next };
        });
      },

      selectAllMessages: (messageIds) => {
        set({ selectedMessageIds: new Set(messageIds) });
      },

      clearMessageSelection: () => {
        set({ selectedMessageIds: new Set<string>() });
      },

      // ============================================
      // KEYBOARD SHORTCUTS
      // ============================================
      isKeyboardShortcutsOpen: false,

      toggleKeyboardShortcuts: () => {
        set((state) => ({
          isKeyboardShortcutsOpen: !state.isKeyboardShortcutsOpen,
        }));
      },

      // ============================================
      // PINNED CONVERSATIONS
      // ============================================
      pinnedConversationIds: [],

      togglePinnedConversation: (conversationId) => {
        set((state) => {
          const pinned = state.pinnedConversationIds;
          const next = pinned.includes(conversationId)
            ? pinned.filter((id) => id !== conversationId)
            : [...pinned, conversationId];
          return { pinnedConversationIds: next };
        });
      },

    }),
    {
      name: "ui-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        brand: state.brand,
        isSidebarCollapsed: state.isSidebarCollapsed,
        chatDensity: state.chatDensity,
        pinnedConversationIds: state.pinnedConversationIds,
      }),
    },
  ),
);

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook để show toast notifications
 */
export const useToast = () => {
  const addToast = useUIStore((state) => state.addToast);

  return {
    success: (message: string, duration?: number) =>
      addToast({ type: "success", message, duration }),
    error: (message: string, duration?: number) =>
      addToast({ type: "error", message, duration }),
    warning: (message: string, duration?: number) =>
      addToast({ type: "warning", message, duration }),
    info: (message: string, duration?: number) =>
      addToast({ type: "info", message, duration }),
    custom: (toast: Omit<Toast, "id">) => addToast(toast),
  };
};
