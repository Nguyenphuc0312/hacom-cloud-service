import React, { Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CommandPalette } from "../components/layout/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "../lib/commandPalette";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { PersistentNavigationRail } from "../shared/layout";
import { GlobalWebSocketProvider } from "../features/realtime/GlobalWebSocketProvider";
import {
  dispatchNotificationClick,
  listenForOpenConversation,
} from "../features/chat/events/chatUiEvents";
import { useReminderStore } from "../stores/reminderStore";
import { useFriendshipStore } from "../stores/friendshipStore";
import { AuthenticatedRouteFallback } from "./AuthenticatedRouteFallback";

/**
 * Persistent authenticated app chrome. Route content changes through Outlet;
 * the navigation rail stays mounted across authenticated modules.
 */
export const AuthenticatedLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);
  const checkReminder = useReminderStore((s) => s.checkReminder);

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
    return listenForOpenConversation(({ conversationId, messageId }) => {
      // Notify ChatPage first (sets the jump-to-message target), then route
      // straight to the target conversation. Navigating to the specific id —
      // not bare ROUTE_PATHS.CHAT — avoids overriding ChatPage's own navigate
      // and works from any page (chat or not). Falls back to /chat if no id.
      dispatchNotificationClick({ conversationId, messageId });
      navigate(
        conversationId
          ? `${ROUTE_PATHS.CHAT}/${conversationId}`
          : ROUTE_PATHS.CHAT,
      );
    });
  }, [navigate]);

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
