import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { dispatchContactProfileViewMock, toastErrorMock } = vi.hoisted(() => ({
  dispatchContactProfileViewMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

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

vi.mock("../../ui", () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
  },
}));

vi.mock("../../../features/chat/events/chatUiEvents", () => ({
  dispatchContactProfileView: dispatchContactProfileViewMock,
}));

import { MessageBodyRenderer } from "./MessageBodyRenderer";
import { MessageType } from "../../../types";

const VALID_CONTACT_USER_ID = "0f3112fc-b70c-446a-a873-f85f1a4ea6f6";

const buildContactMessage = (contactUserId: string) =>
  ({
    id: "msg-contact-1",
    conversationId: "conv-contact-1",
    type: MessageType.CONTACT,
    content: "",
    metadata: {
      contactUserId,
      displayName: "Alice Contact",
      username: "alice",
    },
    attachments: [],
  }) as any;

describe("MessageBodyRenderer contact-card direct DM dispatch", () => {
  beforeEach(() => {
    dispatchContactProfileViewMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("dispatches the contact-card flow when contactUserId is a UUID", async () => {
    const user = userEvent.setup();

    render(
      <MessageBodyRenderer
        message={buildContactMessage(VALID_CONTACT_USER_ID)}
        isOwn={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View profile" }));

    expect(dispatchContactProfileViewMock).toHaveBeenCalledWith({
      userId: VALID_CONTACT_USER_ID,
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("does not dispatch the contact-card flow when contactUserId is not a UUID", async () => {
    const user = userEvent.setup();

    render(
      <MessageBodyRenderer
        message={buildContactMessage("legacy-user-id")}
        isOwn={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View profile" }));

    expect(dispatchContactProfileViewMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "This contact card cannot start a chat.",
    );
  });
});
