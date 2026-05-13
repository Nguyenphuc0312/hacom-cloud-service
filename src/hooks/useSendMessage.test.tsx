import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSendMessage } from "../features/chat/hooks/useSendMessage";

const sendMessageTriggerMock = vi.fn();
const unwrapMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (typeof options?.defaultValue === "string" && options.defaultValue) || key,
  }),
}));

vi.mock("../stores", () => ({
  useAuthStore: (selector: (state: { user: Record<string, unknown> }) => unknown) =>
    selector({
      user: {
        id: "user-1",
        username: "alice",
        displayName: "Alice",
        effectiveDisplayName: "Alice",
        avatar: null,
      },
    }),
  useGroupStore: (
    selector: (state: { setSlowModeCooldown: ReturnType<typeof vi.fn> }) => unknown,
  ) => selector({ setSlowModeCooldown: vi.fn() }),
}));

vi.mock("../features/api/chatApi", () => ({
  useSendMessageMutation: () => [sendMessageTriggerMock],
}));

vi.mock("../components/ui", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("useSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unwrapMock.mockResolvedValue({ id: "server-message-1" });
    sendMessageTriggerMock.mockReturnValue({
      unwrap: unwrapMock,
    });
  });

  it("maps finalized attachments without legacy object storage fields", async () => {
    const { result } = renderHook(() =>
      useSendMessage({
        conversationId: "conv-1",
      }),
    );

    await act(async () => {
      result.current.sendMessage("hello", undefined, {
        id: "file-1",
        objectKey: "private/key",
        url: "https://signed.example/private/key",
        downloadUrl: "https://signed.example/private/key",
        expiresAt: "2026-05-13T00:00:00.000Z",
        type: "image",
        fileName: "photo.png",
        mimeType: "image/png",
        fileSize: 12,
      });
    });

    expect(sendMessageTriggerMock).toHaveBeenCalledTimes(1);
    const payload = sendMessageTriggerMock.mock.calls[0]?.[0];
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        id: "file-1",
        type: "image",
        fileName: "photo.png",
        mimeType: "image/png",
        fileSize: 12,
      }),
    ]);
    expect(payload.attachments?.[0]).not.toHaveProperty("objectKey");
    expect(payload.attachments?.[0]).not.toHaveProperty("url");
    expect(payload.attachments?.[0]).not.toHaveProperty("downloadUrl");
    expect(payload.attachments?.[0]).not.toHaveProperty("expiresAt");
  });
});
