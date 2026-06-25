import React, { Suspense } from "react";
import { Outlet, useNavigate } from "react-router-dom";
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

/**
 * Persistent authenticated app chrome. Route content changes through Outlet;
 * the navigation rail stays mounted across authenticated modules.
 */
export const AuthenticatedLayout: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);
  const checkReminder = useReminderStore((s) => s.checkReminder);

  // Bootstrap friend aliases into enrichedProfileStore on every page load so
  // ChatHeader/RoomItem show alias immediately without waiting for Friends tab.
  React.useEffect(() => {
    const { hasHydrated, fetchFriends } = useFriendshipStore.getState();
    if (!hasHydrated) void fetchFriends();
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
      dispatchNotificationClick({ conversationId, messageId });
      navigate(ROUTE_PATHS.CHAT);
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
            <Suspense fallback={<div className="flex-1" />}>
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
