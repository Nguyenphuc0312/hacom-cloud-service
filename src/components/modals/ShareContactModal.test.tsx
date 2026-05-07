import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareContactModal } from "./ShareContactModal";
import { searchUsersUseCase } from "../../features/chat/usecases/searchUsers";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string) || key,
  }),
}));

vi.mock("../../hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock("../../features/chat/usecases/searchUsers", () => ({
  searchUsersUseCase: vi.fn(),
}));

const searchUsersUseCaseMock = vi.mocked(searchUsersUseCase);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const successResponse = (rows: Array<Record<string, unknown>>) =>
  ({
    success: true,
    data: rows,
  }) as never;

const renderOpenModal = () =>
  render(
    <ShareContactModal
      isOpen
      currentUserId="current-user"
      onClose={vi.fn()}
      onShare={vi.fn().mockResolvedValue(undefined)}
    />,
  );

describe("ShareContactModal search", () => {
  beforeEach(() => {
    searchUsersUseCaseMock.mockReset();
  });

  it("does not let an older response overwrite the latest query results", async () => {
    const firstSearch = deferred<never>();
    const secondSearch = deferred<never>();
    searchUsersUseCaseMock
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    renderOpenModal();

    fireEvent.click(screen.getByRole("button", { name: "Choose contact" }));
    const input = screen.getByPlaceholderText("Search by username/email/phone");

    fireEvent.change(input, { target: { value: "al" } });
    await waitFor(() => {
      expect(searchUsersUseCaseMock).toHaveBeenCalledWith(
        "al",
        1,
        20,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.change(input, { target: { value: "ali" } });
    await waitFor(() => {
      expect(searchUsersUseCaseMock).toHaveBeenCalledWith(
        "ali",
        1,
        20,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    secondSearch.resolve(
      successResponse([
        { id: "user-2", username: "alice", displayName: "Alice Latest" },
      ]),
    );
    expect(await screen.findByText("Alice Latest")).toBeInTheDocument();

    firstSearch.resolve(
      successResponse([
        { id: "user-1", username: "old", displayName: "Old Result" },
      ]),
    );

    await waitFor(() => {
      expect(screen.queryByText("Old Result")).not.toBeInTheDocument();
      expect(screen.getByText("Alice Latest")).toBeInTheDocument();
    });
  });

  it("aborts pending search on unmount", async () => {
    const pendingSearch = deferred<never>();
    searchUsersUseCaseMock.mockReturnValueOnce(pendingSearch.promise);

    const { unmount } = renderOpenModal();

    fireEvent.click(screen.getByRole("button", { name: "Choose contact" }));
    fireEvent.change(screen.getByPlaceholderText("Search by username/email/phone"), {
      target: { value: "al" },
    });

    await waitFor(() => expect(searchUsersUseCaseMock).toHaveBeenCalledTimes(1));
    const signal = searchUsersUseCaseMock.mock.calls[0][3]?.signal;

    unmount();

    expect(signal?.aborted).toBe(true);
    pendingSearch.resolve(successResponse([]));
  });
});
