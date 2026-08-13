import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadResourceWithName } from "../../utils/downloadFile";
import { ImagePreviewModal } from "./ImagePreviewModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

vi.mock("../../utils/downloadFile", () => ({
  downloadResourceWithName: vi.fn().mockResolvedValue(undefined),
}));

describe("ImagePreviewModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("downloads a Cloud image with its original upload name", async () => {
    render(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        images={[
          {
            url: "http://localhost:5100/cloud-object/signed-image",
            alt: "Ảnh bản thiết kế.png",
            fileName: "Ảnh bản thiết kế.png",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));

    await waitFor(() => {
      expect(downloadResourceWithName).toHaveBeenCalledWith(
        "http://localhost:5100/cloud-object/signed-image",
        "Ảnh bản thiết kế.png",
      );
    });
  });
});
