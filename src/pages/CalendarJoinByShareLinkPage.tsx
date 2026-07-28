/**
 * @fileoverview CalendarJoinByShareLinkPage — trang mở khi bấm link chia sẻ
 * lịch họp (khác /join/:token — trang đó là mời NHÓM CHAT, còn trang này là
 * mời THAM GIA 1 LỊCH HỌP).
 *
 * Luồng: mount → nạp THÔNG TIN XEM TRƯỚC (không tham gia) → người dùng xem
 * lịch gì / của ai / lúc nào → tự bấm "Xác nhận tham gia". Cố ý KHÔNG auto-join
 * như trước: bấm một cái link lạ mà thành ACCEPTED ngay thì người dùng không có
 * cơ hội từ chối, và tên họ đã hiện trong danh sách của người khác rồi.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarDaysIcon,
  ClockIcon,
  UserIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Button, toast } from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import {
  hrCalendarApi,
  type HRCalendarShareLinkPreview,
} from "../features/api/hrCalendarApi";
import { formatShareLinkWhen } from "../features/calendar/utils/formatShareLinkWhen";
import { extractApiError } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import { useAuthStore } from "../stores/authStore";

type JoinStatus = "idle" | "joining" | "joined" | "failed";
type PreviewStatus = "loading" | "ready" | "failed";

export const CalendarJoinByShareLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const [status, setStatus] = useState<JoinStatus>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [preview, setPreview] = useState<HRCalendarShareLinkPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");

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

  // Nạp thông tin xem trước khi mount — CHỈ đọc, không tham gia. Việc tham gia
  // chờ người dùng bấm nút.
  useEffect(() => {
    if (!isInitialized || !token) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await hrCalendarApi.previewShareLink(token);
        if (cancelled) return;
        setPreview(data);
        setAlreadyJoined(data.alreadyJoined);
        if (data.alreadyJoined) setStatus("joined");
        setPreviewStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorText(extractApiError(error).message);
        setPreviewStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, isInitialized]);

  const openCalendar = useCallback(() => {
    navigate(ROUTE_PATHS.CALENDAR, { replace: true });
  }, [navigate]);

  const statusBody =
    status === "joined"
      ? alreadyJoined
        ? t("calendar:joinByShareLink.alreadyJoinedDescription", {
            defaultValue: "Bạn đã ở trong lịch họp này. Xem chi tiết trong trang Lịch.",
          })
        : t("calendar:joinByShareLink.joinedDescription", {
            defaultValue: "Lịch họp đã được thêm vào lịch của bạn.",
          })
      : t("calendar:joinByShareLink.confirmDescription", {
          defaultValue:
            "Xem lại thông tin bên dưới. Bạn chỉ được thêm vào danh sách tham gia sau khi bấm xác nhận.",
        });

  return (
    <AppPage layout="narrow">
      <AppPageHeader
        title={t("calendar:joinByShareLink.title", { defaultValue: "Tham gia lịch họp" })}
        subtitle={t("calendar:joinByShareLink.subtitle", {
          defaultValue: "Lời mời tham gia lịch họp qua link chia sẻ.",
        })}
        onBack={() => navigate(ROUTE_PATHS.CALENDAR)}
        backLabel={t("common:actions.back", { defaultValue: "Quay lại" })}
      />

      <AppPageBody className="items-center justify-center">
        <div className="w-full max-w-lg">
          <div className="app-page-panel space-y-5 p-6 sm:p-7">
            {/* Thẻ thông tin lịch họp — phải hiện TRƯỚC khi người dùng xác nhận,
                để không ai tham gia một buổi họp mà chưa biết đó là họp gì. */}
            <div className="app-page-subtle flex items-start gap-3 rounded-xl px-4 py-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1976D2]/10 text-[#1565C0]">
                <CalendarDaysIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                {previewStatus === "loading" ? (
                  <>
                    <div className="h-4 w-2/3 animate-pulse rounded bg-surface-hover" />
                    <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
                  </>
                ) : preview ? (
                  <>
                    <p className="text-sm font-semibold text-text-primary">
                      {preview.title}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                      {formatShareLinkWhen(
                        preview.startAt,
                        preview.endAt,
                        preview.allDay,
                      )}
                    </p>
                    {preview.organizerName && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                        <UserIcon className="h-3.5 w-3.5 shrink-0" />
                        {t("calendar:joinByShareLink.organizer", {
                          defaultValue: "Người tổ chức",
                        })}
                        : {preview.organizerName}
                      </p>
                    )}
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                      <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                      {t("calendar:joinByShareLink.participantCount", {
                        defaultValue: "{{count}} người tham gia",
                        count: preview.participantCount,
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-text-primary">
                    {t("calendar:joinByShareLink.shareLink", {
                      defaultValue: "Link chia sẻ lịch họp",
                    })}
                  </p>
                )}
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

              {/* Link hỏng/thu hồi/hết hạn (previewStatus="failed") thì chỉ còn
                  lối về trang Lịch — mời bấm "Tham gia" lúc đó là mời gặp lỗi. */}
              <Button
                type="button"
                className="w-full"
                isLoading={status === "joining"}
                disabled={previewStatus === "loading"}
                variant={
                  status === "joined" || previewStatus === "failed"
                    ? "secondary"
                    : "primary"
                }
                onClick={
                  status === "joined" || previewStatus === "failed"
                    ? openCalendar
                    : () => token && void joinEvent(token)
                }
              >
                {status === "joined" || previewStatus === "failed"
                  ? t("calendar:joinByShareLink.openCalendar", {
                      defaultValue: "Mở Lịch",
                    })
                  : t("calendar:joinByShareLink.cta", {
                      defaultValue: "Xác nhận tham gia",
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
