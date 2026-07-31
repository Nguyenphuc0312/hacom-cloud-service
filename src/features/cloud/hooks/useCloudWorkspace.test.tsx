import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudApi } from "../api/cloudApi";
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
  trashedAt: "2026-07-31T03:00:00Z",
  expiresAt: "2026-08-01T03:00:00Z",
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

describe("useCloudWorkspace trash lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves server-confirmed items between active and trash collections", async () => {
    vi.spyOn(cloudApi, "listItems").mockResolvedValue({
      items: [activeItem],
    });
    vi.spyOn(cloudApi, "listTrash").mockResolvedValue({ items: [] });
    vi.spyOn(cloudApi, "health").mockResolvedValue({
      status: "UP",
      service: "hacom-cloud-api",
    });
    const quotaSpy = vi
      .spyOn(cloudApi, "getQuota")
      .mockResolvedValueOnce(activeQuota)
      .mockResolvedValueOnce(trashQuota)
      .mockResolvedValueOnce(activeQuota);
    vi.spyOn(cloudApi, "trashItem").mockResolvedValue(trashedItem);
    vi.spyOn(cloudApi, "restoreItem").mockResolvedValue(activeItem);

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
});
