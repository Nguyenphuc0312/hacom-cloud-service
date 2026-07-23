import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "../ui";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { useGroupStore } from "../../stores/groupStore";
import { createGroupInviteLinkUseCase } from "../../features/chat/usecases/createGroupInviteLink";
import { revokeGroupInviteLinkUseCase } from "../../features/chat/usecases/revokeGroupInviteLink";

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export interface GroupInviteLinks {
  isFormOpen: boolean;
  openForm: () => void;
  closeForm: () => void;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  isCreating: boolean;
  /** id của link đang thu hồi, null khi không có thao tác nào chạy. */
  revokingId: string | null;
  createLink: () => Promise<void>;
  copyLink: (value?: string) => Promise<void>;
  revokeLink: (linkId: string) => Promise<void>;
  deleteLink: (linkId: string) => Promise<void>;
  reset: () => void;
}

/**
 * Quản lý link mời của nhóm: tạo, sao chép, thu hồi, xoá.
 *
 * Tách khỏi GroupInfo vì đây là nhóm state tự chứa — chỉ cần biết nhóm nào và
 * người dùng có quyền admin hay không.
 */
export const useGroupInviteLinks = (
  conversationId: string,
  isAdmin: boolean,
): GroupInviteLinks => {
  const { t } = useTranslation();
  const upsertInviteLink = useGroupStore((state) => state.upsertInviteLink);
  const removeInviteLink = useGroupStore((state) => state.removeInviteLink);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const openForm = useCallback(() => setIsFormOpen(true), []);
  const closeForm = useCallback(() => setIsFormOpen(false), []);

  const reset = useCallback(() => {
    setIsFormOpen(false);
    setNameDraft("");
  }, []);

  const createLink = useCallback(async () => {
    if (!isAdmin || isCreating) return;
    setIsCreating(true);
    try {
      const response = await createGroupInviteLinkUseCase({
        conversationId,
        name: nameDraft.trim() || undefined,
      });
      const payload = unwrapApiSuccess(response) as Record<string, unknown>;
      const id = asOptionalString(payload.id) || "";
      if (!id) throw new Error("Invite link id missing");

      upsertInviteLink(conversationId, {
        id,
        conversationId,
        name: asOptionalString(payload.name),
        inviteUrl: asOptionalString(payload.inviteUrl),
        token: asOptionalString(payload.token),
        tokenPreview: asOptionalString(payload.tokenPreview),
        usageCount:
          typeof payload.usageCount === "number" ? payload.usageCount : 0,
        usageLimit:
          typeof payload.usageLimit === "number" ? payload.usageLimit : null,
        expireAt: asNullableString(payload.expireAt),
        revokedAt: asNullableString(payload.revokedAt),
        createdAt:
          asOptionalString(payload.createdAt) || new Date().toISOString(),
      });

      const copyValue =
        asOptionalString(payload.inviteUrl) ||
        asOptionalString(payload.token) ||
        "";
      if (copyValue && typeof navigator !== "undefined") {
        void navigator.clipboard.writeText(copyValue);
      }

      setIsFormOpen(false);
      setNameDraft("");
      toast.success(t("profile:groupInfo.invite.created"));
    } catch (error) {
      toast.error(
        extractApiError(error).message ||
          t("profile:groupInfo.invite.createFailed"),
      );
    } finally {
      setIsCreating(false);
    }
  }, [conversationId, isAdmin, isCreating, nameDraft, t, upsertInviteLink]);

  const copyLink = useCallback(
    async (value?: string) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast.success(t("profile:groupInfo.invite.copied"));
      } catch {
        toast.error(t("profile:groupInfo.invite.copyFailed"));
      }
    },
    [t],
  );

  const revokeLink = useCallback(
    async (linkId: string) => {
      if (!isAdmin || !linkId) return;
      setRevokingId(linkId);
      try {
        await revokeGroupInviteLinkUseCase(conversationId, linkId);
        removeInviteLink(conversationId, linkId);
        toast.success(t("profile:groupInfo.invite.revoked"));
      } catch (error) {
        toast.error(
          extractApiError(error).message ||
            t("profile:groupInfo.invite.revokeFailed"),
        );
      } finally {
        setRevokingId(null);
      }
    },
    [conversationId, isAdmin, removeInviteLink, t],
  );

  const deleteLink = useCallback(
    async (linkId: string) => {
      if (!isAdmin || !linkId) return;
      try {
        await revokeGroupInviteLinkUseCase(conversationId, linkId);
      } catch {
        /* đã bị xoá hoặc không đủ quyền — vẫn gỡ khỏi danh sách local */
      }
      removeInviteLink(conversationId, linkId);
    },
    [conversationId, isAdmin, removeInviteLink],
  );

  return {
    isFormOpen,
    openForm,
    closeForm,
    nameDraft,
    setNameDraft,
    isCreating,
    revokingId,
    createLink,
    copyLink,
    revokeLink,
    deleteLink,
    reset,
  };
};

export default useGroupInviteLinks;
