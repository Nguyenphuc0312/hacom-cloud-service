import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsEventNames } from "@hacom/chat-shared-types/ws";

const tokenState = vi.hoisted(() => ({
  current: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature",
}));

vi.mock("../services/tokenService", () => ({
  getAccessToken: vi.fn(() => tokenState.current),
  updateAccessToken: vi.fn(),
}));

vi.mock("../utils/jwtHelpers", () => ({
  getJwtExpirationMs: vi.fn(() => Date.now() + 60 * 60 * 1000),
  isJwtLike: vi.fn(
    (value: unknown) =>
      typeof value === "string" &&
      value !== "not-a-jwt" &&
      value.split(".").length === 3,
  ),
  isTokenExpired: vi.fn(() => false),
  isTokenExpiringSoon: vi.fn(() => false),
  normalizeToken: vi.fn((value: string) => value),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose:
    | ((event: { code: number; reason: string }) => void)
    | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(event: string, data: unknown) {
    this.onmessage?.({
      data: JSON.stringify({
        event,
        data,
      }),
    });
  }

  failClose(code: number, reason: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

describe("WebSocketManager security", () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    MockWebSocket.reset();
    tokenState.current = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature";
    vi.stubGlobal("WebSocket", MockWebSocket);
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("never appends token-like credentials to the websocket URL", async () => {
    const socketModule = await import("./socket");
    const manager = socketModule.initSocket();

    manager.connect();

    expect(MockWebSocket.instances).toHaveLength(1);
    const [{ url }] = MockWebSocket.instances;
    expect(url).not.toContain("token=");
    expect(url).not.toContain("access_token=");
    expect(url).not.toContain("jwt=");
  });

  it("reconnect path keeps using a clean websocket URL", async () => {
    const socketModule = await import("./socket");
    const manager = socketModule.initSocket();

    manager.connect();
    const firstSocket = MockWebSocket.instances[0];
    firstSocket?.failClose(1006, "transport_lost");

    vi.runOnlyPendingTimers();

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    MockWebSocket.instances.forEach((instance) => {
      expect(instance.url).not.toContain("token=");
      expect(instance.url).not.toContain("access_token=");
      expect(instance.url).not.toContain("jwt=");
    });
  });

  it("stops reconnecting on auth failure and never falls back to query token", async () => {
    const socketModule = await import("./socket");
    const manager = socketModule.initSocket();

    manager.connect();
    const firstSocket = MockWebSocket.instances[0];
    firstSocket?.failClose(4401, "close_4401");

    vi.runOnlyPendingTimers();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(manager.getConnectionState()).toBe("auth_failed");
    expect(
      consoleWarnSpy.mock.calls.some((args) =>
        JSON.stringify(args).includes("retry_query_token_fallback"),
      ),
    ).toBe(false);
  });

  it("marks missing token as unauthenticated and does not create a socket", async () => {
    tokenState.current = "not-a-jwt";
    const socketModule = await import("./socket");
    const manager = socketModule.initSocket();

    manager.connect();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(manager.getConnectionState()).toBe("unauthenticated");
  });

  it("logs only redacted auth payload details", async () => {
    const socketModule = await import("./socket");
    const manager = socketModule.initSocket();

    manager.connect();
    const socket = MockWebSocket.instances[0];
    socket?.open();
    socket?.receive(WsEventNames.AUTH_UNAUTHORIZED, {
      message: "auth failed",
      accessToken: tokenState.current,
      token: tokenState.current,
    });

    [
      ...consoleInfoSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
      ...consoleDebugSpy.mock.calls,
    ]
      .map((args) => JSON.stringify(args))
      .forEach((entry) => {
      expect(entry).not.toContain(tokenState.current);
      });
    expect(manager.getConnectionState()).toBe("auth_failed");
  });
});
