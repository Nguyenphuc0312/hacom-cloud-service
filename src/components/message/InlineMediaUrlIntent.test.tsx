import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../../types";

const testState = vi.hoisted(() => ({
  options: [] as Array<{ intent?: string } | undefined>,
  resolveUrl: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("../../hooks", () => ({
  useAttachmentDownloadUrl: (
    _conversationId: unknown,
    _attachment: unknown,
    options?: { intent?: string },
  ) => {
    testState.options.push(options);
    return {
      url: undefined,
      isLoading: false,
      error: null,
      resolveUrl: testState.resolveUrl,
    };
  },
}));

vi.mock("../../hooks/useInViewport", () => ({
  useInViewport: () => true,
}));

import { StickerMessage } from "./StickerMessage";
import { VoiceMessage } from "./VoiceMessage";

const sticker: Attachment = {
  id: "sticker-1",
  objectKey: "attachments/sticker-1.png",
  fileName: "sticker.png",
  mimeType: "image/png",
  type: FileType.IMAGE,
} as Attachment;

const voice: Attachment = {
  id: "voice-1",
  objectKey: "attachments/voice-1.mp3",
  fileName: "voice.mp3",
  mimeType: "audio/mpeg",
  type: FileType.AUDIO,
} as Attachment;

describe("inline media URL intents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.options = [];
    testState.resolveUrl.mockResolvedValue(undefined);
  });

  it("resolves a visible sticker with the image preview intent", async () => {
    render(
      <StickerMessage
        conversationId="conversation-1"
        attachment={sticker}
      />,
    );

    await waitFor(() => {
      expect(testState.resolveUrl).toHaveBeenCalledTimes(1);
    });
    expect(testState.options).toContainEqual(
      expect.objectContaining({ intent: "preview" }),
    );
  });

  it("configures voice playback with the inline view intent", () => {
    render(
      <VoiceMessage
        conversationId="conversation-1"
        attachment={voice}
        isOwn={false}
      />,
    );

    expect(testState.options).toContainEqual(
      expect.objectContaining({ intent: "view" }),
    );
  });
});
