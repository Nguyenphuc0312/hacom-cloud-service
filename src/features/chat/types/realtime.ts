export interface SocketLike {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler?: (...args: unknown[]) => void) => void;
}

export interface RealtimeUnsubscribe {
  (): void;
}
