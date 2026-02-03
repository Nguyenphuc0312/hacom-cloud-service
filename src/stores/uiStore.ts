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
  setTheme: (theme: Theme) => void;

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

  // Keyboard shortcuts
  isKeyboardShortcutsOpen: boolean;
  toggleKeyboardShortcuts: () => void;
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
      setTheme: (theme) => {
        set({ theme });

        // Apply theme to document
        const root = document.documentElement;
        if (theme === "dark") {
          root.classList.add("dark");
        } else if (theme === "light") {
          root.classList.remove("dark");
        } else {
          // System preference
          const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
          ).matches;
          root.classList.toggle("dark", prefersDark);
        }
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
      // KEYBOARD SHORTCUTS
      // ============================================
      isKeyboardShortcutsOpen: false,

      toggleKeyboardShortcuts: () => {
        set((state) => ({
          isKeyboardShortcutsOpen: !state.isKeyboardShortcutsOpen,
        }));
      },
    }),
    {
      name: "ui-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        isSidebarCollapsed: state.isSidebarCollapsed,
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
