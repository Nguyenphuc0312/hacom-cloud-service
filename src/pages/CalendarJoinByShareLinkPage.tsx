/**
 * @fileoverview CalendarJoinByShareLinkPage — trang mở khi bấm link chia sẻ
 * lịch họp (khác /join/:token — trang đó là mời NHÓM CHAT, còn trang này là
 * mời THAM GIA 1 LỊCH HỌP). Tự động add người dùng vào participants khi mount
 * (giống JoinByLinkPage), chỉ khác đích đến sau khi xong: /calendar thay vì
 * /chat/:conversationId.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Button, toast } from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { hrCalendarApi } from "../features/api/hrCalendarApi";
import { extractApiError } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import { useAuthStore } from "../stores/authStore";

type JoinStatus = "idle" | "joining" | "joined" | "failed";

export const CalendarJoinByShareLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  const joinEvent = useCallback(
    async (joinToken: string) => {
      setStatus("joining");
      setErrorText(null);

      try {
        const result = await hrCalendarApi.joinByShareLink(joinToken);
        setAlreadyJoined(result.status === "already_joined");
        setStatus("joined");
        toast.success(
          result.status === "already_joined"
            ? t("calendar:joinByShareLink.alreadyJoined", {
                defaultValue: "Bạn đã ở trong lịch họp này rồi",
              })
            : t("calendar:joinByShareLink.joined", {
                defaultValue: "Đã tham gia lịch họp thành công",
              }),
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

    void joinEvent(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isInitialized, status]);

  const openCalendar = useCallback(() => {
    navigate(ROUTE_PATHS.CALENDAR, { replace: true });
  }, [navigate]);

  const statusBody =
    status === "joined"
      ? alreadyJoined
        ? t("calendar:joinByShareLink.alreadyJoinedDescription", {
            defaultValue: "Bạn có thể xem lịch họp này trong trang Lịch.",
          })
        : t("calendar:joinByShareLink.joinedDescription", {
            defaultValue: "Lịch họp đã được thêm vào lịch của bạn.",
          })
      : t("calendar:joinByShareLink.description", {
          defaultValue: "Dùng liên kết này để tự động tham gia lịch họp được chia sẻ.",
        });

  return (
    <AppPage layout="narrow">
      <AppPageHeader
        title={t("calendar:joinByShareLink.title", { defaultValue: "Tham gia lịch họp" })}
        subtitle={t("calendar:joinByShareLink.description", {
          defaultValue: "Dùng liên kết này để tự động tham gia lịch họp được chia sẻ.",
        })}
        onBack={() => navigate(ROUTE_PATHS.CALENDAR)}
        backLabel={t("common:actions.back", { defaultValue: "Quay lại" })}
      />

      <AppPageBody className="items-center justify-center">
        <div className="w-full max-w-lg">
          <div className="app-page-panel space-y-5 p-6 sm:p-7">
            <div className="app-page-subtle flex items-center gap-3 rounded-xl px-4 py-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1976D2]/10 text-[#1565C0]">
                <CalendarDaysIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {t("calendar:joinByShareLink.shareLink", {
                    defaultValue: "Link chia sẻ lịch họp",
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-6 text-text-secondary">
                {status === "joining"
                  ? t("calendar:joinByShareLink.joining", {
                      defaultValue: "Đang tham gia lịch họp...",
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
                variant={status === "joined" ? "secondary" : "primary"}
                onClick={status === "joined" ? openCalendar : () => token && void joinEvent(token)}
              >
                {status === "joined"
                  ? t("calendar:joinByShareLink.openCalendar", {
                      defaultValue: "Mở Lịch",
                    })
                  : t("calendar:joinByShareLink.cta", {
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

export default CalendarJoinByShareLinkPage;
