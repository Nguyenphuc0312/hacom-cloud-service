import { useWebSocket } from "../../../hooks";

export const useChatRealtime = () => {
  const websocket = useWebSocket();
  return websocket;
};
