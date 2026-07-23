import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "../ui";
import uploadClient from "../../services/uploadClient";
import { extractApiError } from "../../lib/apiContract";

export type GroupAvatarUploadStage =
  | "idle"
  | "validating"
  | "reserving"
  | "uploading"
  | "completing"
  | "attaching"
  | "success"
  | "error";

const ALLOWED_GROUP_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const revokeBlobUrl = (value: string | null) => {
  if (value?.startsWith("blob:")) URL.revokeObjectURL(value);
};

export const resolveGroupAvatarStageLabel = (
  stage: GroupAvatarUploadStage,
  progress: number,
): string | null => {
  switch (stage) {
    case "validating": return "Đang kiểm tra ảnh";
    case "reserving": return "Đang chuẩn bị tải lên";
    case "uploading": return progress > 0 ? `Đang tải lên ${progress}%` : "Đang tải lên";
    case "completing": return "Đang xác minh ảnh";
    case "attaching": return "Đang áp dụng ảnh";
    case "success": return "Cập nhật ảnh đại diện thành công";
    case "error": return "Không thể cập nhật ảnh đại diện";
    default: return null;
  }
};

export interface GroupAvatarUpload {
  /** Blob URL xem trước trong lúc tải, null khi không có. */
  previewUrl: string | null;
  stage: GroupAvatarUploadStage;
  progress: number;
  /** Nhãn tiến trình cho người dùng, null khi đang idle. */
  stageLabel: string | null;
  isUploading: boolean;
  handleFileChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  reset: () => void;
}

/**
 * Vòng đời tải ảnh đại diện nhóm: chọn file → kiểm tra → reserve → upload →
 * complete → attach, kèm preview blob và dọn URL để không rò bộ nhớ.
 *
 * Tách khỏi GroupInfo (1807 dòng) vì đây là nhóm state tự chứa: chỉ cần
 * `conversationId` và một callback làm mới sau khi gắn ảnh xong.
 */
export const useGroupAvatarUpload = (
  conversationId: string,
  onUploaded: () => Promise<void> | void,
): GroupAvatarUpload => {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<GroupAvatarUploadStage>("idle");
  const [progress, setProgress] = useState(0);

  const clearPreview = useCallback(() => {
    setPreviewUrl((current) => {
      revokeBlobUrl(current);
      return null;
    });
  }, []);

  const reset = useCallback(() => {
    setStage("idle");
    setProgress(0);
    clearPreview();
  }, [clearPreview]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      if (!file) {
        setStage("idle");
        return;
      }

      const mimeType = file.type.trim().toLowerCase();
      setStage("validating");
      if (!mimeType || !ALLOWED_GROUP_AVATAR_TYPES.has(mimeType)) {
        setStage("error");
        toast.error(
          t("profile:settings.upload.unsupportedType", {
            defaultValue: "Loại ảnh không được hỗ trợ",
          }),
        );
        return;
      }

      setProgress(0);
      setPreviewUrl((current) => {
        revokeBlobUrl(current);
        return URL.createObjectURL(file);
      });

      try {
        uploadClient.validateUpload(file, "group_avatar");
        setStage("reserving");
        const reserved = await uploadClient.reserveUpload({
          purpose: "group_avatar",
          groupId: conversationId,
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
        });

        setStage("uploading");
        await uploadClient.uploadToSignedUrl({
          signedUrl: reserved.uploadUrl,
          method: reserved.uploadMethod || "PUT",
          headers: {
            ...(reserved.uploadHeaders || {}),
            "Content-Type": mimeType,
          },
          file,
          onProgress: (value) => setProgress(value),
        });

        setStage("completing");
        const completed = await uploadClient.completeUpload({
          uploadId: reserved.uploadId,
          conversationId,
          objectKey: reserved.objectKey,
        });
        const fileId = completed.attachment?.id;
        if (!fileId) {
          throw new Error("Group avatar upload completed without fileId");
        }

        setStage("attaching");
        await uploadClient.attachToGroupAvatar({
          groupId: conversationId,
          fileId,
          uploadId: completed.uploadId,
        });
        await onUploaded();

        setStage("success");
        setProgress(100);
        clearPreview();
        toast.success(
          t("profile:groupInfo.avatarUpdated", {
            defaultValue: "Cập nhật ảnh đại diện thành công",
          }),
        );
      } catch (error) {
        setStage("error");
        clearPreview();
        toast.error(
          extractApiError(error).message ||
            t("profile:groupInfo.avatarUpdateFailed", {
              defaultValue: "Không thể cập nhật ảnh đại diện",
            }),
        );
      }
    },
    [clearPreview, conversationId, onUploaded, t],
  );

  // Dọn blob URL cuối cùng khi unmount / khi preview đổi.
  useEffect(() => () => revokeBlobUrl(previewUrl), [previewUrl]);

  return {
    previewUrl,
    stage,
    progress,
    stageLabel: resolveGroupAvatarStageLabel(stage, progress),
    isUploading: stage === "uploading",
    handleFileChange,
    reset,
  };
};

export default useGroupAvatarUpload;
