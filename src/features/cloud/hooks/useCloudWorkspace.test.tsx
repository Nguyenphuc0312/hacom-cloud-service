import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudApi, CloudApiError } from "../api/cloudApi";
import type { CloudItem, CloudQuota } from "../types";
import { useCloudWorkspace } from "./useCloudWorkspace";

const userId = "11111111-1111-4111-8111-111111111111";
const activeItem: CloudItem = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "text",
  status: "ready",
  content: "Ghi chú",
  sizeBytes: 8,
  createdAt: "2026-07-31T02:00:00Z",
  updatedAt: "2026-07-31T02:00:00Z",
};
const trashedItem: CloudItem = {
  ...activeItem,
  status: "trashed",
  deletedAt: "2026-07-31T03:00:00Z",
  purgeAfter: "2026-08-01T03:00:00Z",
  updatedAt: "2026-07-31T03:00:00Z",
};
const activeQuota: CloudQuota = {
  limitBytes: 5_000_000_000,
  usedBytes: 8,
  activeBytes: 8,
  trashBytes: 0,
  reservedBytes: 0,
  availableBytes: 4_999_999_992,
  updatedAt: "2026-07-31T02:00:00Z",
};
const trashQuota: CloudQuota = {
  ...activeQuota,
  activeBytes: 0,
  trashBytes: 8,
  updatedAt: "2026-07-31T03:00:00Z",
};

const createTestItem = (
  id: string,
  updates: Partial<CloudItem> = {},
): CloudItem => ({ ...activeItem, id, ...updates });

describe("useCloudWorkspace trash lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves server-confirmed items between active and trash collections", async () => {
    vi.spyOn(cloudApi, "listItems")
      .mockResolvedValueOnce({ items: [activeItem] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [activeItem] });
    vi.spyOn(cloudApi, "listTrash")
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [trashedItem] })
      .mockResolvedValueOnce({ items: [] });
    vi.spyOn(cloudApi, "health").mockResolvedValue({
      status: "UP",
      service: "hacom-cloud-api",
    });
    vi.spyOn(cloudApi, "getCurrentQuotaRequest").mockRejectedValue(
      new CloudApiError({
        status: 404,
        code: "QUOTA_REQUEST_NOT_FOUND",
        message: "No quota request",
      }),
    );
    const quotaSpy = vi
      .spyOn(cloudApi, "getQuota")
      .mockResolvedValueOnce(activeQuota)
      .mockResolvedValueOnce(trashQuota)
      .mockResolvedValueOnce(activeQuota);
    vi.spyOn(cloudApi, "trashItem").mockResolvedValue({
      itemId: activeItem.id,
      status: "trashed",
      deletedAt: trashedItem.deletedAt,
      purgeAfter: trashedItem.purgeAfter,
      applied: true,
    });
    vi.spyOn(cloudApi, "restoreItem").mockResolvedValue({
      itemId: activeItem.id,
      status: "ready",
      applied: true,
    });

    const { result } = renderHook(() => useCloudWorkspace(userId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.trashItem(activeItem.id);
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.trashItems).toEqual([trashedItem]);
    expect(result.current.quota).toEqual(trashQuota);

    await act(async () => {
      await result.current.restoreItem(activeItem.id);
    });
    expect(result.current.items).toEqual([activeItem]);
    expect(result.current.trashItems).toEqual([]);
    expect(result.current.quota).toEqual(activeQuota);
    expect(quotaSpy).toHaveBeenCalledTimes(3);
  });

  it("sends the selected type filter to both active and Trash queries", async () => {
    const listItems = vi.spyOn(cloudApi, "listItems").mockResolvedValue({
      items: [],
    });
    const listTrash = vi.spyOn(cloudApi, "listTrash").mockResolvedValue({
      items: [],
    });
    vi.spyOn(cloudApi, "health").mockResolvedValue({
      status: "UP",
      service: "hacom-cloud-api",
    });
    vi.spyOn(cloudApi, "getQuota").mockResolvedValue(activeQuota);
    vi.spyOn(cloudApi, "getCurrentQuotaRequest").mockRejectedValue(
      new CloudApiError({
        status: 404,
        code: "QUOTA_REQUEST_NOT_FOUND",
        message: "No quota request",
      }),
    );

    const { result } = renderHook(() => useCloudWorkspace(userId, "", "audio"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listItems.mock.calls[0]?.[1]).toMatchObject({ type: "audio" });
    expect(listTrash.mock.calls[0]?.[1]).toMatchObject({ type: "audio" });
  });

  it("ignores a load-more response from the previous search/filter generation", async () => {
    let resolveMore: ((page: { items: CloudItem[]; nextCursor?: string }) => void) | undefined;
    const morePage = new Promise<{ items: CloudItem[]; nextCursor?: string }>(
      (resolve) => {
        resolveMore = resolve;
      },
    );
    const filteredItem = createTestItem("filtered-item", { type: "image" });
    const staleItem = createTestItem("stale-item", { type: "image" });
    const listItems = vi
      .spyOn(cloudApi, "listItems")
      .mockResolvedValueOnce({ items: [activeItem], nextCursor: "old-cursor" })
      .mockReturnValueOnce(morePage)
      .mockResolvedValue({ items: [filteredItem] });
    vi.spyOn(cloudApi, "listTrash").mockResolvedValue({ items: [] });
    vi.spyOn(cloudApi, "health").mockResolvedValue({
      status: "UP",
      service: "hacom-cloud-api",
    });
    vi.spyOn(cloudApi, "getQuota").mockResolvedValue(activeQuota);
    vi.spyOn(cloudApi, "getCurrentQuotaRequest").mockRejectedValue(
      new CloudApiError({
        status: 404,
        code: "QUOTA_REQUEST_NOT_FOUND",
        message: "No quota request",
      }),
    );

    const { result, rerender } = renderHook(
      ({ filter }: { filter: "all" | "image" }) =>
        useCloudWorkspace(userId, "", filter),
      { initialProps: { filter: "all" } },
    );
    await waitFor(() => expect(result.current.nextCursor).toBe("old-cursor"));

    let loadMorePromise: Promise<void> = Promise.resolve();
    act(() => {
      loadMorePromise = result.current.loadMore();
    });
    rerender({ filter: "image" });
    await waitFor(() => expect(result.current.items).toEqual([filteredItem]));

    resolveMore?.({ items: [staleItem], nextCursor: undefined });
    await loadMorePromise;

    expect(result.current.items).toEqual([filteredItem]);
    expect(
      listItems.mock.calls.some(([, options]) => options?.type === "image"),
    ).toBe(true);
  });

  it("empties all Trash pages through item-level permanent deletes", async () => {
    const listTrash = vi
      .spyOn(cloudApi, "listTrash")
      .mockResolvedValueOnce({ items: [trashedItem] })
      .mockResolvedValueOnce({ items: [trashedItem] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValue({ items: [] });
    vi.spyOn(cloudApi, "listItems").mockResolvedValue({ items: [] });
    vi.spyOn(cloudApi, "health").mockResolvedValue({
      status: "UP",
      service: "hacom-cloud-api",
    });
    vi.spyOn(cloudApi, "getQuota").mockResolvedValue(trashQuota);
    vi.spyOn(cloudApi, "getCurrentQuotaRequest").mockRejectedValue(
      new CloudApiError({
        status: 404,
        code: "QUOTA_REQUEST_NOT_FOUND",
        message: "No quota request",
      }),
    );
    const permanentlyDelete = vi
      .spyOn(cloudApi, "permanentlyDeleteItem")
      .mockResolvedValue({
        itemId: trashedItem.id,
        status: "delete_pending",
        async: true,
      });

    const { result } = renderHook(() => useCloudWorkspace(userId));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.emptyTrash();
    });

    expect(permanentlyDelete).toHaveBeenCalledTimes(1);
    expect(permanentlyDelete.mock.calls[0]?.[2]?.idempotencyKey).toMatch(
      /^cloud-web-/,
    );
    expect(listTrash).toHaveBeenCalledTimes(4);
    expect(result.current.trashItems).toEqual([]);
  });
});
