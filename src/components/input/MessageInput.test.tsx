import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageInput } from "./MessageInput";
import type { AttachmentDraft } from "../../types/attachmentDraft";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        (options?.defaultValue as string) || key,
    }),
  };
});

const renderComposer = (
  onSend: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => unknown | Promise<unknown>,
  options: {
    initialValue?: string;
    uploadDrafts?: AttachmentDraft[];
    hasReadyDrafts?: boolean;
  } = {},
) => {
  const Harness = () => {
    const [value, setValue] = React.useState(options.initialValue ?? "hello");

    return (
      <MessageInput
        value={value}
        onChange={setValue}
        onSend={onSend}
        mode="normal"
        conversationId="room-1"
        uploadDrafts={options.uploadDrafts}
        hasReadyDrafts={options.hasReadyDrafts}
        onRemoveDraft={vi.fn()}
        onCancelUpload={vi.fn()}
        onRetryUpload={vi.fn()}
        onClearAllDrafts={vi.fn()}
      />
    );
  };

  render(<Harness />);
};

describe("MessageInput send flow", () => {
  it("keeps the draft when send is rejected before optimistic accept", async () => {
    const onSend = vi.fn(() => {
      throw new Error("blocked");
    });

    renderComposer(onSend, { initialValue: "draft text" });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("chat-composer-input")).toHaveValue(
      "draft text",
    );
  });

  it("clears the draft after optimistic accept", async () => {
    const onSend = vi.fn(() => ({ disposition: "acceptedOptimistic" }));

    renderComposer(onSend, { initialValue: "send me" });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-composer-input")).toHaveValue(""),
    );
  });

  it("prevents double send while the first submit is still pending", async () => {
    let resolveSend: (value: unknown) => void = () => undefined;
    const onSend = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    renderComposer(onSend, { initialValue: "one send" });
    const sendButton = screen.getByTestId("chat-send-button");

    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledTimes(1);
    resolveSend({ disposition: "acceptedOptimistic" });

    await waitFor(() =>
      expect(screen.getByTestId("chat-composer-input")).toHaveValue(""),
    );
  });

  it("keeps text and attachment drafts when queued attachment send is rejected", async () => {
    const draft: AttachmentDraft = {
      localId: "draft-1",
      file: new File(["content"], "report.pdf", { type: "application/pdf" }),
      kind: "pdf",
      status: "ready",
      progress: 100,
      uploaded: {
        fileId: "file-1",
        mimeType: "application/pdf",
        size: 7,
        name: "report.pdf",
      },
    };
    const onSend = vi.fn(() => Promise.reject(new Error("network")));

    renderComposer(onSend, {
      initialValue: "see attached",
      uploadDrafts: [draft],
      hasReadyDrafts: true,
    });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("chat-composer-input")).toHaveValue(
      "see attached",
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });
});
