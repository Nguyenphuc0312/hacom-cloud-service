import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LinkIcon } from "@heroicons/react/24/outline";
import { Button, toast } from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { groupApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { resolveConversationId } from "../lib/conversationIdentity";
import { ROUTE_PATHS } from "../router/paths";
import { useAuthStore } from "../stores/authStore";

type JoinStatus = "idle" | "joining" | "joined" | "pending" | "failed";

export const JoinByLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const tokenPreview = useMemo(() => {
    if (!token) return "";
    if (token.length <= 12) return token;
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }, [token]);

  const joinAndNavigate = useCallback(
    async (joinToken: string) => {
      setStatus("joining");
      setErrorText(null);

      try {
        const response = await groupApi.joinByLink(joinToken);
        const payload = unwrapApiSuccess(response) as Record<string, unknown>;

        const resolvedId = resolveConversationId(payload, {
          source: "JoinByLinkPage.joinAndNavigate",
        });

        if (payload.status === "pending") {
          setConversationId(resolvedId);
          setStatus("pending");
          return;
        }

        setConversationId(resolvedId);
        setStatus("joined");
        toast.success(
          t("group:joinByLink.joined", { defaultValue: "Đã tham gia thành công" }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        setStatus("failed");
        setErrorText(apiError.message);
      }
    },
    [t],
  );

  // Auto-join on mount once auth is confirmed (ProtectedRoute guarantees isAuthenticated).
  useEffect(() => {
    if (!isInitialized) return;
    if (!token) return;
    if (status !== "idle") return;

    void joinAndNavigate(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isInitialized, status]);

  const openChat = useCallback(() => {
    if (conversationId) {
      navigate(`${ROUTE_PATHS.CHAT}/${conversationId}`, { replace: true });
      return;
    }
    navigate(ROUTE_PATHS.CHAT, { replace: true });
  }, [conversationId, navigate]);

  const statusBody =
    status === "pending"
      ? t("group:joinByLink.pending", {
          defaultValue: "Yêu cầu tham gia của bạn đang chờ quản trị viên duyệt.",
        })
      : status === "joined"
        ? t("group:joinByLink.joinedDescription", {
            defaultValue: "Bạn có thể bắt đầu trò chuyện trong nhóm ngay bây giờ.",
          })
        : t("group:joinByLink.description", {
            defaultValue: "Dùng liên kết này để tham gia nhóm. Quyền truy cập phụ thuộc cài đặt nhóm.",
          });

  return (
    <AppPage layout="narrow">
      <AppPageHeader
        title={t("group:joinByLink.title", { defaultValue: "Tham gia nhóm" })}
        subtitle={t("group:joinByLink.description", {
          defaultValue: "Dùng liên kết này để tham gia nhóm. Quyền truy cập phụ thuộc cài đặt nhóm.",
        })}
        onBack={() => navigate(ROUTE_PATHS.CHAT)}
        backLabel={t("common:actions.back", { defaultValue: "Quay lại" })}
      />

      <AppPageBody className="items-center justify-center">
        <div className="w-full max-w-lg">
          <div className="app-page-panel space-y-5 p-6 sm:p-7">
            <div className="app-page-subtle flex items-center gap-3 rounded-xl px-4 py-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LinkIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {t("group:joinByLink.inviteLink", {
                    defaultValue: "Liên kết mời",
                  })}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {tokenPreview || "-"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-6 text-text-secondary">
                {status === "joining"
                  ? t("group:joinByLink.joining", {
                      defaultValue: "Đang tham gia nhóm...",
                    })
                  : statusBody}
              </p>

              {errorText ? (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {errorText}
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                isLoading={status === "joining"}
                variant={status === "joined" || status === "pending" ? "secondary" : "primary"}
                onClick={
                  status === "joined" || status === "pending"
                    ? openChat
                    : () => token && void joinAndNavigate(token)
                }
              >
                {status === "pending"
                  ? t("group:joinByLink.backToChat", {
                      defaultValue: "Quay lại chat",
                    })
                  : status === "joined"
                    ? t("group:joinByLink.openGroup", {
                        defaultValue: "Mở nhóm",
                      })
                    : t("group:joinByLink.cta", {
                        defaultValue: "Tham gia ngay",
                      })}
              </Button>
            </div>
          </div>
        </div>
      </AppPageBody>
    </AppPage>
  );
};

export default JoinByLinkPage;
