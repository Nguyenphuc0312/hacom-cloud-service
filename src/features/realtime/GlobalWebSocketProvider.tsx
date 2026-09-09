import React, { createContext, useContext } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useNotifications } from "../../hooks/useNotifications";
import { useAuthStore } from "../../stores";
import { useHrDesktopNotifications } from "../calendar/useHrDesktopNotifications";
import type { ConnectionState } from "../../hooks/useWebSocket";

interface WebSocketContextValue {
  isConnected: boolean;
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: unknown) => void;
  joinConversation: (
    conversationId: string,
    options?: { skipInitialDeltaSync?: boolean },
  ) => void;
  leaveConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string, type?: string) => void;
  sendTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const GlobalWebSocketProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const ws = useWebSocket();
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  useNotifications(isAuthenticated);
  useHrDesktopNotifications();

  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useGlobalWebSocket = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error(
      "useGlobalWebSocket must be used inside GlobalWebSocketProvider",
    );
  }
  return ctx;
};
