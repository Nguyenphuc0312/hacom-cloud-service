import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAttachmentDownloadUrlCache: vi.fn(),
  clearPreviewUrlCache: vi.fn(),
  clearBlobPreviewCache: vi.fn(),
  invalidateThumbnailUrlCacheForConversation: vi.fn(),
  dispatchFileSourceInvalidated: vi.fn(),
  invalidateTags: vi.fn((tags: unknown) => ({
    type: "chatApi/invalidateTags",
    payload: tags,
  })),
}));

vi.mock("../../../hooks/useAttachmentDownloadUrl", () => ({
  clearAttachmentDownloadUrlCache: mocks.clearAttachmentDownloadUrlCache,
}));
vi.mock("../../../hooks/useFilePreview", () => ({
  clearPreviewUrlCache: mocks.clearPreviewUrlCache,
}));
vi.mock("../../../hooks/useBatchThumbnailUrl", () => ({
  invalidateThumbnailUrlCacheForConversation: mocks.invalidateThumbnailUrlCacheForConversation,
}));
vi.mock("../../../lib/blobPreviewCache", () => ({
  blobPreviewCache: { clear: mocks.clearBlobPreviewCache },
}));
vi.mock("../../api/chatApi", () => ({
  chatApi: { util: { invalidateTags: mocks.invalidateTags } },
}));
vi.mock("../events/chatUiEvents", () => ({
  dispatchFileSourceInvalidated: mocks.dispatchFileSourceInvalidated,
}));

import { invalidateConversationFileResources } from "./fileResourceInvalidation";

describe("invalidateConversationFileResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateTags.mockImplementation((tags: unknown) => ({
      type: "chatApi/invalidateTags",
      payload: tags,
    }));
  });

  it("invalidates exact tags, clears every local source cache, and notifies active views", () => {
    const dispatch = vi.fn();
    const tags = [
      { type: "ConversationResources", id: "conversation-1-summary" },
      { type: "ConversationResources", id: "conversation-1-media" },
      { type: "ConversationResources", id: "conversation-1-files" },
      { type: "ConversationResources", id: "conversation-1-links" },
    ];

    invalidateConversationFileResources(
      dispatch as never,
      "conversation-1",
      "message-recalled",
    );

    expect(mocks.invalidateTags).toHaveBeenCalledWith(tags);
    expect(dispatch).toHaveBeenCalledWith({
      type: "chatApi/invalidateTags",
      payload: tags,
    });
    expect(mocks.invalidateThumbnailUrlCacheForConversation).toHaveBeenCalledWith("conversation-1");
    expect(mocks.clearPreviewUrlCache).toHaveBeenCalledTimes(1);
    expect(mocks.clearAttachmentDownloadUrlCache).toHaveBeenCalledTimes(1);
    expect(mocks.clearBlobPreviewCache).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchFileSourceInvalidated).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      reason: "message-recalled",
    });
  });
});
