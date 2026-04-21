import { beforeEach, describe, expect, it } from "vitest";

import { useChatUiStore } from "./chatUiStore";

describe("chatUiStore", () => {
  beforeEach(() => {
    useChatUiStore.setState({
      searchOpen: false,
      mediaPanelOpen: false,
      composerDraftByConversation: {},
    });
  });

  it("stores composer drafts per conversation", () => {
    const { setComposerDraft } = useChatUiStore.getState();

    setComposerDraft("room-1", "draft a");
    setComposerDraft("room-2", "draft b");

    expect(useChatUiStore.getState().composerDraftByConversation).toEqual({
      "room-1": "draft a",
      "room-2": "draft b",
    });
  });

  it("removes composer drafts when cleared or emptied", () => {
    const { setComposerDraft, clearComposerDraft } = useChatUiStore.getState();

    setComposerDraft("room-1", "draft a");
    setComposerDraft("room-1", "");
    setComposerDraft("room-2", "draft b");
    clearComposerDraft("room-2");

    expect(useChatUiStore.getState().composerDraftByConversation).toEqual({});
  });
});
