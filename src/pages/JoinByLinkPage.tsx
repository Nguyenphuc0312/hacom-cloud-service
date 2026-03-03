import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button, toast } from "../components/ui";
import { groupApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";

type JoinStatus = "idle" | "joining" | "joined" | "pending" | "failed";

export const JoinByLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
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
      const payload = unwrapApiSuccess(response) as {
        roomId?: string;
        status?: "joined" | "pending";
      };

      setRoomId(payload.roomId || null);
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
    if (roomId) {
      navigate(`${ROUTE_PATHS.CHAT}/${roomId}`);
      return;
    }
    navigate(ROUTE_PATHS.CHAT);
  }, [navigate, roomId]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(ROUTE_PATHS.CHAT)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("common:actions.back", { defaultValue: "Back" })}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">
          {t("group:joinByLink.title", { defaultValue: "Join group" })}
        </h1>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-8">
        <div className="w-full rounded-2xl border border-border bg-surface-raised p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t("group:joinByLink.inviteLink", { defaultValue: "Invite link" })}
              </p>
              <p className="text-xs text-text-muted">{tokenPreview || "-"}</p>
            </div>
          </div>

          {status === "pending" ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {t("group:joinByLink.pending", {
                  defaultValue: "Your join request is pending admin approval.",
                })}
              </p>
              <Button type="button" className="w-full" onClick={openChat}>
                {t("group:joinByLink.backToChat", {
                  defaultValue: "Back to chat",
                })}
              </Button>
            </div>
          ) : status === "joined" ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {t("group:joinByLink.joinedDescription", {
                  defaultValue: "You can start chatting in this group now.",
                })}
              </p>
              <Button type="button" className="w-full" onClick={openChat}>
                {t("group:joinByLink.openGroup", { defaultValue: "Open group" })}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {t("group:joinByLink.description", {
                  defaultValue:
                    "Use this invite link to join the group. Access depends on group settings.",
                })}
              </p>
              {errorText && <p className="text-sm text-danger">{errorText}</p>}
              <Button
                type="button"
                className="w-full"
                isLoading={status === "joining"}
                onClick={() => void handleJoin()}
              >
                {t("group:joinByLink.cta", { defaultValue: "Join now" })}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default JoinByLinkPage;
