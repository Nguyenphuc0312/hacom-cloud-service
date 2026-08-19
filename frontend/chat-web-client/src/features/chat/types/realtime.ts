export type RealtimeEventHandler = (payload: unknown) => void;

export interface SocketLike {
  on: (event: string, handler: RealtimeEventHandler) => void | (() => void);
  off?: (event: string, handler?: RealtimeEventHandler) => void;
}

export interface RealtimeUnsubscribe {
  (): void;
}
