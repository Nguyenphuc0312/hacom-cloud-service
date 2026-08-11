import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudApi } from "../../../features/cloud/api/cloudApi";
import { saveResourceMessageToCloud } from "./resourceCloudActions";

vi.mock("../../../features/cloud/api/cloudApi", () => ({
  cloudApi: {
    saveMessage: vi.fn(),
  },
}));

describe("saveResourceMessageToCloud", () => {
  beforeEach(() => {
    vi.mocked(cloudApi.saveMessage).mockReset();
  });

  it("does not duplicate content that is already in personal Cloud", async () => {
    await expect(saveResourceMessageToCloud("message-1", true, "file-1"))
      .resolves.toBe("already-in-cloud");

    expect(cloudApi.saveMessage).not.toHaveBeenCalled();
  });

  it("saves the selected attachment through Cloud asset API", async () => {
    vi.mocked(cloudApi.saveMessage).mockResolvedValue({ message: {}, assets: [] });

    await expect(saveResourceMessageToCloud("message-1", false, "file-1"))
      .resolves.toBe("saved");

    expect(cloudApi.saveMessage).toHaveBeenCalledWith("message-1", "file-1");
  });
});
