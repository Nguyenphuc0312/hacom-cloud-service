import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { HrNotificationBell } from "./features/calendar/components/HrNotificationBell";
import { useFriendshipStore } from "./stores/friendshipStore";
import "./index.css";
useFriendshipStore.setState({
  friendByUserId: { "auth-huy": { id: "auth-huy", alias: "Hoàng sếp" } },
} as never);
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <div style={{ padding: 24, display: "flex", justifyContent: "flex-end" }}>
      <HrNotificationBell />
    </div>
  </MemoryRouter>,
);
