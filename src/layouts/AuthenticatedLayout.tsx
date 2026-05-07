import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { CommandPalette } from "../components/layout/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "../lib/commandPalette";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { PersistentNavigationRail } from "../shared/layout";

/**
 * Persistent authenticated app chrome. Route content changes through Outlet;
 * the navigation rail stays mounted across authenticated modules.
 */
export const AuthenticatedLayout: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);

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
    <div className="private-app-shell">
      <div className="private-app-viewport">
        <PersistentNavigationRail
          currentUser={currentUser}
          onCurrentUserClick={() => navigate(ROUTE_PATHS.SETTINGS)}
        />
        <div className="private-app-route">
          <Outlet />
        </div>
      </div>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};

export default AuthenticatedLayout;
