import React from "react";
import { Outlet } from "react-router-dom";
import { CommandPalette } from "../components/layout/CommandPalette";
import { COMMAND_PALETTE_OPEN_EVENT } from "../lib/commandPalette";

/**
 * Layout boundary for authenticated app area.
 * Keep it thin; feature-specific chrome lives in page-level containers.
 */
export const AppLayout: React.FC = () => {
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
    <>
      <Outlet />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </>
  );
};

export default AppLayout;
