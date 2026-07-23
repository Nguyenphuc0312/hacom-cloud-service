import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "../ui";
import { extractApiError } from "../../lib/apiContract";
import { chatApi } from "../../features/chat/api/chatApi";

export interface GroupRename {
  isEditing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  /** Mở ô nhập, khởi tạo bản nháp từ tên hiện tại. */
  start: () => void;
  /** Đóng ô nhập, bỏ mọi thay đổi chưa lưu. */
  cancel: () => void;
  submit: () => Promise<void>;
}

/**
 * Đổi tên nhóm: bản nháp + đóng/mở ô nhập + gọi API.
 *
 * `setIsSubmitting` được tiêm vào chứ không giữ trong hook, vì cờ đó khoá cả
 * panel (dùng chung với thêm thành viên / rời nhóm / xoá nhóm) — giữ một nguồn
 * duy nhất thay vì nhân đôi.
 */
export const useGroupRename = (
  conversationId: string,
  currentName: string,
  onRenamed: () => Promise<void> | void,
  setIsSubmitting: (value: boolean) => void,
): GroupRename => {
  const { t } = useTranslation();
  // Một state thay vì hai: null = không sửa, chuỗi = bản nháp đang gõ.
  // Nhờ vậy không cần effect đồng bộ draft theo currentName — mở ô nhập là lấy
  // tên mới nhất, đóng lại là bản nháp biến mất.
  const [draft, setDraft] = useState<string | null>(null);

  // Đổi nhóm khi đang gõ dở → bỏ bản nháp (tính trong lúc render, không effect).
  const [lastConversationId, setLastConversationId] = useState(conversationId);
  if (lastConversationId !== conversationId) {
    setLastConversationId(conversationId);
    setDraft(null);
  }

  const start = useCallback(() => setDraft(currentName), [currentName]);
  const cancel = useCallback(() => setDraft(null), []);

  const submit = useCallback(async () => {
    const nextName = (draft ?? "").trim();
    if (!nextName) {
      toast.error(t("profile:toast.groupNameRequired"));
      return;
    }
    if (nextName === (currentName || "").trim()) {
      setDraft(null);
      return;
    }

    setIsSubmitting(true);
    try {
      await chatApi.group.updateSettings(conversationId, { title: nextName });
      await onRenamed();
      setDraft(null);
      toast.success(t("profile:toast.groupRenamed"));
    } catch (error) {
      toast.error(
        extractApiError(error).message || t("profile:toast.groupRenameFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [conversationId, currentName, draft, onRenamed, setIsSubmitting, t]);

  return {
    isEditing: draft !== null,
    draft: draft ?? "",
    setDraft,
    start,
    cancel,
    submit,
  };
};

export default useGroupRename;
