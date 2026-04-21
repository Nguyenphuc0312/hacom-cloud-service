import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LinkIcon } from "@heroicons/react/24/outline";
import { Button, toast } from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { groupApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { resolveConversationId } from "../lib/conversationIdentity";
import { ROUTE_PATHS } from "../router/paths";

type JoinStatus = "idle" | "joining" | "joined" | "pending" | "failed";

export const JoinByLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const tokenPreview = useMemo(() => {
    if (!token) return "";
    if (token.length <= 12) return token;
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }, [token]);

  const handleJoin = useCallback(async () => {
    if (!token) return;
    setStatus("joining");
    setErrorText(null);

    try {
      const response = await groupApi.joinByLink(token);
      const payload = unwrapApiSuccess(response) as Record<string, unknown>;

      setConversationId(
        resolveConversationId(payload, {
          source: "JoinByLinkPage.handleJoin",
        }),
      );
      if (payload.status === "pending") {
        setStatus("pending");
        return;
      }

      setStatus("joined");
      toast.success(
        t("group:joinByLink.joined", { defaultValue: "Joined successfully" }),
      );
    } catch (error) {
      const apiError = extractApiError(error);
      setStatus("failed");
      setErrorText(apiError.message);
    }
  }, [t, token]);

  const openChat = useCallback(() => {
    if (conversationId) {
      navigate(`${ROUTE_PATHS.CHAT}/${conversationId}`);
      return;
    }
    navigate(ROUTE_PATHS.CHAT);
  }, [conversationId, navigate]);

  const statusBody =
    status === "pending"
      ? t("group:joinByLink.pending", {
          defaultValue: "Your join request is pending admin approval.",
        })
      : status === "joined"
        ? t("group:joinByLink.joinedDescription", {
            defaultValue: "You can start chatting in this group now.",
          })
        : t("group:joinByLink.description", {
            defaultValue:
              "Use this invite link to join the group. Access depends on group settings.",
          });

  return (
    <AppPage layout="narrow">
      <AppPageHeader
        title={t("group:joinByLink.title", { defaultValue: "Join group" })}
        subtitle={t("group:joinByLink.description", {
          defaultValue:
            "Use this invite link to join the group. Access depends on group settings.",
        })}
        onBack={() => navigate(ROUTE_PATHS.CHAT)}
        backLabel={t("common:actions.back", { defaultValue: "Back" })}
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
                    defaultValue: "Invite link",
                  })}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {tokenPreview || "-"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-6 text-text-secondary">
                {statusBody}
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
                    : () => void handleJoin()
                }
              >
                {status === "pending"
                  ? t("group:joinByLink.backToChat", {
                      defaultValue: "Back to chat",
                    })
                  : status === "joined"
                    ? t("group:joinByLink.openGroup", {
                        defaultValue: "Open group",
                      })
                    : t("group:joinByLink.cta", {
                        defaultValue: "Join now",
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
