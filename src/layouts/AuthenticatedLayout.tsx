import React, { Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CommandPalette } from "../components/layout/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "../lib/commandPalette";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { PersistentNavigationRail } from "../shared/layout";
import { GlobalWebSocketProvider } from "../features/realtime/GlobalWebSocketProvider";
import {
  createChatRouteState,
  listenForNotificationClick,
  listenForOpenConversation,
  listenForStartDirectMessage,
} from "../features/chat/events/chatUiEvents";
import { useReminderStore } from "../stores/reminderStore";
import { useFriendshipStore } from "../stores/friendshipStore";
import { useChatSidebarStore } from "../features/chat/state/chatSidebarStore";
import { AuthenticatedRouteFallback } from "./AuthenticatedRouteFallback";
import { useActivityAnalytics } from '../hooks/useActivityAnalytics';

/**
 * Persistent authenticated app chrome. Route content changes through Outlet;
 * the navigation rail stays mounted across authenticated modules.
 */
export const AuthenticatedLayout: React.FC = () => {
  useActivityAnalytics();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);
  const checkReminder = useReminderStore((s) => s.checkReminder);

  React.useEffect(() => {
    const sidebarState = useChatSidebarStore.getState();
    if (sidebarState.isSearchOpen) sidebarState.closeSearch();
  }, [location.key]);

  // Bootstrap ALL friend aliases on page load so ChatHeader/RoomItem show the
  // "tên gợi nhớ" immediately. Large limit → the alias index (friendByUserId)
  // covers every friend, not just page 1, so DMs of friends #21+ aren't missed.
  React.useEffect(() => {
    const { hasHydrated, fetchFriends } = useFriendshipStore.getState();
    if (!hasHydrated) void fetchFriends({ limit: 100 });
  }, []);

  React.useEffect(() => {
    checkReminder();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkReminder();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkReminder]);

  React.useEffect(() => {
    // Native desktop toasts and the in-app notification centre both dispatch
    // this event. The listener belongs in the persistent layout (rather than
    // ChatPage), because a notification can be clicked while the user is on
    // Calendar, Tasks, or any other authenticated route.
    return listenForNotificationClick((detail) => {
      const { conversationId } = detail;
      if (!conversationId) {
        navigate(ROUTE_PATHS.NOTIFICATIONS);
        return;
      }

      navigate(`${ROUTE_PATHS.CHAT}/${conversationId}`, {
        state: createChatRouteState({
          type: "open-conversation",
          conversationId,
          messageId: detail.messageId,
        }),
      });
    });
  }, [navigate]);

  React.useEffect(() => {
    return listenForOpenConversation((detail) => {
      const { conversationId } = detail;
      navigate(
        conversationId
          ? `${ROUTE_PATHS.CHAT}/${conversationId}`
          : ROUTE_PATHS.CHAT,
        {
          state: createChatRouteState({
            type: "open-conversation",
            ...detail,
          }),
        },
      );
    });
  }, [navigate]);

  React.useEffect(() => {
    return listenForStartDirectMessage(({ userId }) => {
      navigate(
        location.pathname.startsWith(ROUTE_PATHS.CHAT)
          ? location.pathname
          : ROUTE_PATHS.CHAT,
        {
          state: createChatRouteState({
            type: "start-direct-message",
            userId,
          }),
        },
      );
    });
  }, [location.pathname, navigate]);

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      setIsCommandPaletteOpen(true);
    };

    const handleOpenEvent = () => {
      setIsCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, handleOpenEvent);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, handleOpenEvent);
    };
  }, []);

  return (
    <GlobalWebSocketProvider>
      <div className="private-app-shell">
        <div className="private-app-viewport">
          <PersistentNavigationRail
            currentUser={currentUser}
            onCurrentUserClick={() => navigate(ROUTE_PATHS.SETTINGS)}
          />
          <div className="private-app-route">
            <Suspense
              fallback={
                <AuthenticatedRouteFallback pathname={location.pathname} />
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </div>
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
      </div>
    </GlobalWebSocketProvider>
  );
};

export default AuthenticatedLayout;
