import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

import { MessageInput } from "./MessageInput";
import { store } from "../../store";
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

const renderWithProviders = (ui: React.ReactElement) =>
  render(ui, {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
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
    onAddFiles?: (files: File[]) => { errors?: string[] } | void;
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
        onAddFiles={options.onAddFiles}
        onRemoveDraft={vi.fn()}
        onCancelUpload={vi.fn()}
        onRetryUpload={vi.fn()}
        onClearAllDrafts={vi.fn()}
      />
    );
  };

  renderWithProviders(<Harness />);
};

describe("MessageInput send flow", () => {
  it("keeps keystrokes local when the parent does not echo value changes", () => {
    const onChange = vi.fn();
    const onSend = vi.fn();

    renderWithProviders(
      <MessageInput
        value=""
        onChange={onChange}
        onSend={onSend}
        mode="normal"
        conversationId="room-1"
      />,
    );

    fireEvent.change(screen.getByTestId("chat-composer-input"), {
      target: { value: "fast typing" },
    });

    expect(screen.getByTestId("chat-composer-input")).toHaveValue(
      "fast typing",
    );
    expect(onChange).toHaveBeenCalledWith("fast typing");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("resets the local draft when parent sends a new seed key", () => {
    const onChange = vi.fn();
    const onSend = vi.fn();
    const { rerender } = renderWithProviders(
      <MessageInput
        value="old draft"
        valueResetKey={0}
        onChange={onChange}
        onSend={onSend}
        mode="normal"
        conversationId="room-1"
      />,
    );

    fireEvent.change(screen.getByTestId("chat-composer-input"), {
      target: { value: "local edit" },
    });
    expect(screen.getByTestId("chat-composer-input")).toHaveValue(
      "local edit",
    );

    rerender(
      <MessageInput
        value=""
        valueResetKey={1}
        onChange={onChange}
        onSend={onSend}
        mode="normal"
        conversationId="room-1"
      />,
    );

    expect(screen.getByTestId("chat-composer-input")).toHaveValue("");
  });

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

  it("blocks inline send when the message exceeds the hard limit", async () => {
    const onSend = vi.fn();

    renderComposer(onSend, { initialValue: "x".repeat(20_001) });

    const sendButton = screen.getByTestId("chat-send-button");
    expect(sendButton).toBeDisabled();
    expect(
      screen.getByText("Tin nhắn vượt giới hạn 20.000 ký tự."),
    ).toBeInTheDocument();

    fireEvent.click(sendButton);

    await waitFor(() => expect(onSend).not.toHaveBeenCalled());
  });

  it("converts an over-limit draft into a .txt attachment instead of sending inline", async () => {
    const onSend = vi.fn();
    const onAddFiles = vi.fn();

    renderComposer(onSend, {
      initialValue: "x".repeat(20_001),
      onAddFiles,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Gửi dưới dạng tệp .txt" }),
    );

    await waitFor(() => expect(onAddFiles).toHaveBeenCalledTimes(1));
    const [files] = onAddFiles.mock.calls[0] as [File[]];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0]?.name).toMatch(/^message-\d{8}-\d{4}\.txt$/);
    await expect(files[0]?.text()).resolves.toHaveLength(20_001);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId("chat-composer-input")).toHaveValue("");
  });

  it("surfaces long-paste guidance for very large payloads without sending", async () => {
    const onSend = vi.fn();

    renderComposer(onSend, { initialValue: "" });
    const input = screen.getByTestId("chat-composer-input");

    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "x".repeat(100_000),
      },
    });
    fireEvent.change(input, {
      target: { value: "x".repeat(100_000) },
    });

    await waitFor(() =>
      expect(
        screen.getByText("Tin nhắn vượt giới hạn 20.000 ký tự."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-send-button")).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
});
