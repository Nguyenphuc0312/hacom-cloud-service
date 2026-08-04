import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const getUsersByIds = vi.fn();

vi.mock("../../services/api", () => ({
  userApi: {
    getUserById: (userId: string) => getUserById(userId),
    getUsersByIds: (userIds: string[]) => getUsersByIds(userIds),
  },
  conversationApi: {},
  messageApi: {},
  conversationResourcesApi: {},
  fileApi: {},
  linkPreviewApi: {},
}));

import { chatApi } from "./chatApi";

const success = <T,>(data: T) => ({
  success: true,
  data,
});

const makeStore = () =>
  configureStore({
    reducer: { [chatApi.reducerPath]: chatApi.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(chatApi.middleware),
  });

describe("chatApi user profile read model", () => {
  beforeEach(() => {
    getUserById.mockReset();
    getUsersByIds.mockReset();
  });

  it("getUserProfile fetches the target user and exposes HR fields by userId tag", async () => {
    const store = makeStore();
    getUserById.mockResolvedValue(
      success({
        id: "user-a",
        displayName: "Nguyen Van A",
        fullNameFromHr: "Nguyen Van A",
        department: "Engineering",
        position: "Backend Architect",
        company: "Hacom",
        employmentStatus: "ACTIVE",
      }),
    );

    const result = await store.dispatch(
      chatApi.endpoints.getUserProfile.initiate("user-a"),
    );

    expect(getUserById).toHaveBeenCalledWith("user-a");
    expect(result.data).toMatchObject({
      id: "user-a",
      fullNameFromHr: "Nguyen Van A",
      department: "Engineering",
      position: "Backend Architect",
      company: "Hacom",
      employmentStatus: "ACTIVE",
    });
    expect(
      chatApi.util.selectInvalidatedBy(store.getState(), [
        { type: "User", id: "user-a" },
        { type: "UserProfile", id: "user-a" },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointName: "getUserProfile",
          originalArgs: "user-a",
        }),
      ]),
    );
  });

  it("getUsersBatch provides per-user tags so one participant update can invalidate affected batch caches", async () => {
    const store = makeStore();
    getUsersByIds.mockResolvedValue({
      "user-a": { id: "user-a", displayName: "A", department: "Ops" },
      "user-b": { id: "user-b", displayName: "B", department: "Sales" },
    });

    const result = await store.dispatch(
      chatApi.endpoints.getUsersBatch.initiate(["user-b", "user-a", "user-a"]),
    );

    expect(getUsersByIds).toHaveBeenCalledWith(["user-b", "user-a", "user-a"]);
    expect(result.data?.["user-a"]).toMatchObject({
      id: "user-a",
      department: "Ops",
    });
    expect(
      chatApi.util.selectInvalidatedBy(store.getState(), [
        { type: "User", id: "user-b" },
        { type: "UserBatch", id: "user-b" },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointName: "getUsersBatch",
        }),
      ]),
    );
  });
});
