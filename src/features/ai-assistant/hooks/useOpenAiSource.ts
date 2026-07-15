import { useCallback, useState } from "react";
import { fetchAiSourceBlobUrl } from "../services/aiChatApi";
import { resolveSourceUrl } from "../utils/sourceUtils";
import { toast } from "../../../utils/toast";

/**
 * Mở tài liệu nguồn (khối "Nguồn tham khảo" + citation [N] trong câu trả lời).
 * Link AI cần Bearer token nên tab mới không tự mang header — phải auth-fetch →
 * blob → trỏ tab vào blob. Mở tab TRƯỚC (đồng bộ, giữ user gesture) để tránh
 * popup blocker, rồi điều hướng khi có blob. Chỉ mở một link tại một thời điểm.
 */
export function useOpenAiSource() {
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);

  const open = useCallback(
    async (rawUrl: string | undefined) => {
      const href = resolveSourceUrl(rawUrl);
      if (!href || openingUrl !== null) return;

      const tab = window.open("", "_blank", "noopener,noreferrer");
      setOpeningUrl(href);
      try {
        const blobUrl = await fetchAiSourceBlobUrl(href);
        if (tab) {
          tab.location.href = blobUrl;
        } else {
          window.open(blobUrl, "_blank", "noopener,noreferrer");
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch {
        tab?.close();
        toast.error("Không mở được tài liệu nguồn");
      } finally {
        setOpeningUrl(null);
      }
    },
    [openingUrl],
  );

  return { open, openingUrl, isOpening: openingUrl !== null };
}
