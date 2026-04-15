import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type NotificationKind =
  | "message"
  | "mention"
  | "group_activity"
  | "system";

export type NotificationFilter = "all" | "unread" | NotificationKind;

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  conversationId?: string;
  messageId?: string;
  actorId?: string | null;
}

interface NotificationState {
  items: NotificationItem[];
  isPanelOpen: boolean;
  activeFilter: NotificationFilter;
  upsertNotification: (
    notification: Omit<NotificationItem, "isRead" | "readAt"> & {
      isRead?: boolean;
      readAt?: string | null;
    },
  ) => void;
  markAsRead: (id: string) => void;
  markManyAsRead: (ids: string[]) => void;
  markConversationAsRead: (conversationId: string) => void;
  markAllAsRead: (filter?: NotificationFilter) => void;
  clearNotifications: (filter?: NotificationFilter) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setFilter: (filter: NotificationFilter) => void;
  reset: () => void;
}

const MAX_NOTIFICATION_ITEMS = 200;

const byCreatedAtDesc = (a: NotificationItem, b: NotificationItem): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

const matchesFilter = (
  item: NotificationItem,
  filter: NotificationFilter,
): boolean => {
  if (filter === "all") return true;
  if (filter === "unread") return !item.isRead;
  return item.kind === filter;
};

const normalizeNotification = (
  notification: Omit<NotificationItem, "isRead" | "readAt"> & {
    isRead?: boolean;
    readAt?: string | null;
  },
): NotificationItem => {
  const createdAt = notification.createdAt || new Date().toISOString();
  const isRead = notification.isRead === true;

  return {
    ...notification,
    createdAt,
    isRead,
    readAt: isRead
      ? notification.readAt || new Date().toISOString()
      : notification.readAt ?? null,
  };
};

const initialState = {
  items: [] as NotificationItem[],
  isPanelOpen: false,
  activeFilter: "all" as NotificationFilter,
};

export const useNotificationStore = create<NotificationState>()((set) => ({
  ...initialState,

  upsertNotification: (notification) => {
    const normalized = normalizeNotification(notification);

    set((state) => {
      const existingIndex = state.items.findIndex(
        (item) => item.id === normalized.id,
      );
      const nextItems =
        existingIndex >= 0
          ? state.items.map((item, index) =>
              index === existingIndex
                ? {
                    ...item,
                    ...normalized,
                    isRead: normalized.isRead || item.isRead,
                    readAt:
                      normalized.readAt ??
                      item.readAt ??
                      (normalized.isRead ? new Date().toISOString() : null),
                  }
                : item,
            )
          : [normalized, ...state.items];

      return {
        items: [...nextItems]
          .sort(byCreatedAtDesc)
          .slice(0, MAX_NOTIFICATION_ITEMS),
      };
    });
  },

  markAsRead: (id) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id && !item.isRead
          ? {
              ...item,
              isRead: true,
              readAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
  },

  markManyAsRead: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const readAt = new Date().toISOString();

    set((state) => ({
      items: state.items.map((item) =>
        idSet.has(item.id) && !item.isRead
          ? {
              ...item,
              isRead: true,
              readAt,
            }
          : item,
      ),
    }));
  },

  markConversationAsRead: (conversationId) => {
    if (!conversationId) return;
    const readAt = new Date().toISOString();

    set((state) => ({
      items: state.items.map((item) =>
        item.conversationId === conversationId && !item.isRead
          ? {
              ...item,
              isRead: true,
              readAt,
            }
          : item,
      ),
    }));
  },

  markAllAsRead: (filter = "all") => {
    const readAt = new Date().toISOString();

    set((state) => ({
      items: state.items.map((item) =>
        matchesFilter(item, filter) && !item.isRead
          ? {
              ...item,
              isRead: true,
              readAt,
            }
          : item,
      ),
    }));
  },

  clearNotifications: (filter = "all") => {
    set((state) => ({
      items:
        filter === "all"
          ? []
          : state.items.filter((item) => !matchesFilter(item, filter)),
    }));
  },

  setPanelOpen: (open) => {
    set((state) =>
      state.isPanelOpen === open ? state : { isPanelOpen: open },
    );
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setFilter: (filter) => {
    set((state) =>
      state.activeFilter === filter ? state : { activeFilter: filter },
    );
  },

  reset: () => {
    set(initialState);
  },
}));

export const useNotificationUnreadCount = () =>
  useNotificationStore(
    (state) => state.items.reduce((count, item) => count + (item.isRead ? 0 : 1), 0),
  );

export const useFilteredNotifications = () =>
  useNotificationStore(
    useShallow((state) =>
      state.items.filter((item) => matchesFilter(item, state.activeFilter)),
    ),
  );
