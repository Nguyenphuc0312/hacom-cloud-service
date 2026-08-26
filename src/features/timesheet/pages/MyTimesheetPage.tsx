import React from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCcw,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import {
  hrApi,
  type AttendanceExplanation,
  type MyTimesheetDay,
  type MyTimesheetResponse,
  type TimesheetConfirmationStatus,
  type TimesheetPeriodStatus,
} from "../../api/hrApi";
import { ROUTE_PATHS } from "../../../router/paths";
import { WorkPageShell } from "../../work/components/WorkPageShell";
import { formatWorkDate } from "../../work/utils/workDatePresentation";
import { TimesheetPeriodPicker } from "../components/TimesheetPeriodPicker";
import { getTimesheetDayScheduleNotice } from "../timesheetDayPresentation";
import { attendanceCalendarLabel } from "../../calendar/utils/attendanceCalendarPresentation";
import { isSuperAdmin } from "../../auth/utils/isSuperAdmin";
import { useAuthStore } from "../../../stores/authStore";
import {
  gridColumnFor,
  LG_COLUMN_START,
  todayIso,
  WEEK_COLUMNS,
  WEEKDAY_LABELS,
  weekdayIndex,
} from "../timesheetCalendar";

type LoadState =
  | {
      status: "idle" | "loading";
      data: MyTimesheetResponse | null;
      error: null;
    }
  | { status: "success"; data: MyTimesheetResponse; error: null }
  | { status: "error"; data: MyTimesheetResponse | null; error: string };

const now = new Date();

const periodStatusLabel: Record<TimesheetPeriodStatus, string> = {
  DRAFT: "Đang chuẩn bị",
  PENDING_EMPLOYEE: "Chờ xác nhận",
  PENDING_HR: "Chờ HR",
  CLOSED: "Đã chốt",
};

const confirmationStatusLabel: Record<TimesheetConfirmationStatus, string> = {
  PENDING: "Chưa xác nhận",
  CONFIRMED: "Đã xác nhận",
  DISPUTED: "Đã khiếu nại",
};

const explanationStatusLabel: Record<AttendanceExplanation["status"], string> =
  {
    DRAFT: "Nháp",
    SUBMITTED: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    CANCELLED: "Đã hủy",
  };

const explanationStatusClass = (status: AttendanceExplanation["status"]) => {
  if (status === "APPROVED")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED")
    return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
};

const symbolClass = (symbol: string) => {
  const first = symbol.split(";")[0];
  if (first === "+") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (first === "-") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (first === "P") return "border-blue-200 bg-blue-50 text-blue-700";
  if (first === "L") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (first === "KL" || first === "N")
    return "border-slate-200 bg-slate-50 text-slate-600";
  if (first === "Ô" || first === "Cô" || first === "TS")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
};

const formatMonthTitle = (month: number, year: number) =>
  `Tháng ${String(month).padStart(2, "0")}/${year}`;

const formatShortDate = (value?: string | null) => formatWorkDate(value);

const fromInputMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12;
  const validYear = Number.isFinite(year) && year >= 2000 && year <= 2100;
  return {
    month: validMonth ? month : now.getMonth() + 1,
    year: validYear ? year : now.getFullYear(),
  };
};

const periodFromQuery = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  return fromInputMonth(value);
};

const extractErrorMessage = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 409) return "Bảng công không còn ở trạng thái xác nhận.";
  if (status === 422)
    return "Tài khoản chưa liên kết hồ sơ nhân sự hoặc dữ liệu gửi chưa hợp lệ.";
  return "Không tải được dữ liệu chấm công lúc này.";
};

const dayNumber = (date: string) => {
  const value = Number(date.slice(8, 10));
  return Number.isFinite(value) ? value : 0;
};

const DayCell: React.FC<{ day: MyTimesheetDay; isFuture?: boolean }> = ({
  day,
  isFuture = false,
}) => {
  const scheduleNotice = getTimesheetDayScheduleNotice(day.source);
  const dayLabel = attendanceCalendarLabel(day);
  const isUnpaidHoliday = day.source === "HOLIDAY_UNPAID";
  const weekdayLabel = WEEKDAY_LABELS[weekdayIndex(day.date)];
  /*
   * Ngày chưa tới thì mọi dấu hiệu "cần xem lại" đều phải tắt, không chỉ riêng
   * nút Giải trình: viền vàng, icon cảnh báo và dòng "Chờ giải trình" trong
   * tooltip đều bắt nguồn từ cùng một cờ. Bảng công đã tính trước đó vẫn còn cờ
   * cũ trong DB cho tới lần recompute kế tiếp, nên chặn ở một chỗ duy nhất tại
   * đây thay vì rải điều kiện ra từng nơi.
   */
  const needsExplanation = day.needsExplanation && !isFuture;
  const title = [
    `${weekdayLabel} ${formatShortDate(day.date)}`,
    isFuture ? "Ngày chưa tới" : null,
    day.holidayName,
    scheduleNotice?.detail,
    day.firstPunch || day.lastPunch
      ? `${day.firstPunch ?? "--:--"} - ${day.lastPunch ?? "--:--"}`
      : null,
    day.lateMinutes > 0 ? `Muộn ${day.lateMinutes}'` : null,
    day.earlyLeaveMinutes > 0 ? `Về sớm ${day.earlyLeaveMinutes}'` : null,
    needsExplanation ? "Chờ giải trình" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={[
        "min-h-[92px] rounded-lg border p-2 text-left transition-colors",
        isFuture
          ? "border-dashed border-[#e2e8f0] bg-[#fbfcfe]"
          : scheduleNotice
            ? "border-amber-300 bg-amber-50"
            : day.isWorkingDay
              ? "border-[#d7dce3] bg-white"
              : "border-[#e5e7eb] bg-[#f8fbff]",
        needsExplanation ? "ring-1 ring-amber-300" : "",
      ].join(" ")}
      title={title || formatShortDate(day.date)}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`text-sm font-semibold tabular-nums ${
              isFuture ? "text-[#94a3b8]" : "text-[#0f172a]"
            }`}
          >
            {dayNumber(day.date)}
          </span>
          <span className="text-[11px] font-medium text-[#94a3b8]">
            {weekdayLabel}
          </span>
        </span>
        {needsExplanation ? (
          <AlertTriangle
            size={14}
            className="text-amber-500"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {scheduleNotice ? (
        <>
          <span className="inline-flex rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-800">
            {scheduleNotice.label}
          </span>
          <div className="mt-2 text-[11px] leading-4 text-amber-800">
            Cần HR thiết lập lịch làm việc
          </div>
        </>
      ) : dayLabel ? (
        <span
          className={`inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold ${symbolClass(day.displaySymbol)}`}
        >
          {dayLabel}
        </span>
      ) : (
        <span
          className={`text-sm ${isFuture ? "text-[#cbd5e1]" : "text-[#94a3b8]"}`}
        >
          {isFuture ? "·" : "-"}
        </span>
      )}
      <div
        className={`mt-2 text-xs ${isFuture ? "text-[#94a3b8]" : "text-[#64748b]"}`}
      >
        {scheduleNotice
          ? "Chưa tính công"
          : isUnpaidHoliday
            ? "Nghỉ lễ không lương"
            : day.paidDays
              ? `${day.paidDays} công`
              : !day.isWorkingDay
                ? "Nghỉ"
                : isFuture
                  ? "Chưa tới"
                  : "0 công"}
      </div>
      {day.firstPunch || day.lastPunch ? (
        <div className="mt-1 truncate text-[11px] text-[#64748b]">
          {day.firstPunch ?? "--:--"} - {day.lastPunch ?? "--:--"}
        </div>
      ) : null}
    </div>
  );
};

const inferExplanationType = (day: MyTimesheetDay) => {
  if (!day.firstPunch || !day.lastPunch) return "MISSING_PUNCH" as const;
  if (day.lateMinutes > 0) return "LATE" as const;
  if (day.earlyLeaveMinutes > 0) return "EARLY_LEAVE" as const;
  return "OTHER" as const;
};

const ExplainableDayCell: React.FC<{
  day: MyTimesheetDay;
  isFuture?: boolean;
  /**
   * Cột (1–7) mà ngày đầu tháng phải rơi vào, để ô nằm đúng dưới nhãn thứ.
   * Chỉ ngày đầu tiên cần đẩy; các ngày sau tự chảy tiếp trong lưới.
   */
  firstColumn?: number;
  onExplain: (day: MyTimesheetDay) => void;
}> = ({ day, isFuture = false, firstColumn, onExplain }) => (
  // Nút xếp dưới ô, không absolute: bản absolute đè lên dòng giờ chấm công
  // (08:05 - 17:35) làm mất thông tin ở đúng những ngày cần đọc kỹ nhất.
  <div
    className={`flex flex-col ${
      firstColumn && firstColumn > 1 ? LG_COLUMN_START[firstColumn] : ""
    }`}
  >
    <DayCell day={day} isFuture={isFuture} />
    {/*
      Ngày chưa tới thì không có gì để giải trình. Máy chủ đã ngừng gắn cờ cho
      ngày tương lai, nhưng vẫn chặn thêm một lớp ở đây: bảng công cũ đã tính
      trước đó vẫn còn cờ trong DB cho tới lần recompute kế tiếp, và người dùng
      không nên nhìn thấy nút đòi giải trình cho ngày họ chưa đi làm.
    */}
    {day.needsExplanation && day.id && !isFuture ? (
      <button
        type="button"
        className="mt-1 rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
        onClick={() => onExplain(day)}
      >
        Giải trình
      </button>
    ) : null}
  </div>
);

const SummaryTile: React.FC<{
  label: string;
  value: string;
  tone?: string;
}> = ({ label, value, tone = "text-[#1565C0]" }) => (
  <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
    <div className="text-sm text-[#64748b]">{label}</div>
    <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
  </div>
);

const MyExplanationItem: React.FC<{ item: AttendanceExplanation }> = ({
  item,
}) => (
  <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fbff] px-3 py-2">
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-medium text-[#0f172a]">
        {formatShortDate(item.timesheetDay?.workDate)}
      </div>
      <span
        className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${explanationStatusClass(item.status)}`}
      >
        {explanationStatusLabel[item.status]}
      </span>
    </div>
    <div className="mt-1 line-clamp-2 text-xs text-[#64748b]">
      {item.reason}
    </div>
  </div>
);

const PendingExplanationItem: React.FC<{
  item: AttendanceExplanation;
  reviewingId: string | null;
  onReview: (
    item: AttendanceExplanation,
    status: "APPROVED" | "REJECTED",
  ) => void;
}> = ({ item, reviewingId, onReview }) => (
  <div className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#0f172a]">
          {item.employee?.fullName ?? item.employeeId}
        </div>
        <div className="text-xs text-[#64748b]">
          {item.employee?.employeeCode ?? "-"} ·{" "}
          {formatShortDate(item.timesheetDay?.workDate)}
        </div>
      </div>
      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
        {item.type}
      </span>
    </div>
    <div className="mt-2 line-clamp-2 text-xs text-[#475569]">
      {item.reason}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#1565C0] px-2 text-xs font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
        disabled={reviewingId !== null}
        onClick={() => onReview(item, "APPROVED")}
      >
        <CheckCircle2 size={14} aria-hidden="true" />
        {reviewingId === item.id ? "Đang xử lý" : "Duyệt"}
      </button>
      <button
        type="button"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-[#94a3b8]"
        disabled={reviewingId !== null}
        onClick={() => onReview(item, "REJECTED")}
      >
        <XCircle size={14} aria-hidden="true" />
        Từ chối
      </button>
    </div>
  </div>
);

export const MyTimesheetPage: React.FC<{ tabBar?: React.ReactNode }> = ({
  tabBar,
}) => {
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((auth) => auth.user);
  const canReviewOnChat = isSuperAdmin(currentUser);
  const queryPeriod = periodFromQuery(searchParams.get("month"));
  const queryMonth = queryPeriod?.month;
  const queryYear = queryPeriod?.year;
  const [month, setMonth] = React.useState(
    queryPeriod?.month ?? now.getMonth() + 1,
  );
  const [year, setYear] = React.useState(
    queryPeriod?.year ?? now.getFullYear(),
  );
  const [state, setState] = React.useState<LoadState>({
    status: "idle",
    data: null,
    error: null,
  });
  const [disputeNote, setDisputeNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState<
    "confirm" | "dispute" | null
  >(null);
  const [explainingDay, setExplainingDay] =
    React.useState<MyTimesheetDay | null>(null);
  const [explanationReason, setExplanationReason] = React.useState("");
  const [submittingExplanation, setSubmittingExplanation] =
    React.useState(false);
  const [myExplanations, setMyExplanations] = React.useState<
    AttendanceExplanation[]
  >([]);
  const [pendingExplanations, setPendingExplanations] = React.useState<
    AttendanceExplanation[]
  >([]);
  const [reviewingExplanationId, setReviewingExplanationId] = React.useState<
    string | null
  >(null);

  const loadTimesheet = React.useCallback(async () => {
    setState((current) => ({
      status: "loading",
      data: current.data,
      error: null,
    }));
    try {
      const data = await hrApi.getMyTimesheet({ month, year });
      setState({ status: "success", data, error: null });
    } catch (error) {
      setState((current) => ({
        status: "error",
        data: current.data,
        error: extractErrorMessage(error),
      }));
    }
  }, [month, year]);

  const loadExplanations = React.useCallback(async () => {
    try {
      const mine = await hrApi.getMyAttendanceExplanations({ month, year });
      setMyExplanations(mine.items ?? []);
    } catch {
      setMyExplanations([]);
    }

    if (!canReviewOnChat) {
      setPendingExplanations([]);
      return;
    }

    try {
      const pending = await hrApi.getPendingAttendanceExplanations();
      setPendingExplanations(pending.items ?? []);
    } catch {
      setPendingExplanations([]);
    }
  }, [canReviewOnChat, month, year]);

  React.useEffect(() => {
    if (!queryMonth || !queryYear) return;
    setMonth(queryMonth);
    setYear(queryYear);
  }, [queryMonth, queryYear]);

  React.useEffect(() => {
    void loadTimesheet();
  }, [loadTimesheet]);

  React.useEffect(() => {
    void loadExplanations();
  }, [loadExplanations]);

  const data = state.data;
  const period = data?.period ?? null;
  const confirmation = data?.confirmation ?? null;
  const canAct =
    period?.status === "PENDING_EMPLOYEE" &&
    (!confirmation || confirmation.status === "PENDING");
  const days = data?.days ?? [];
  // Mốc so sánh ngày tương lai. Tính một lần cho cả lưới để mọi ô dùng chung
  // một "hôm nay", tránh lệch nếu render vắt qua nửa đêm.
  const today = React.useMemo(() => todayIso(), []);
  // Bộ đếm phải khớp với số nút "Giải trình" thật sự hiện ra: đếm cả ngày chưa
  // tới thì con số vô nghĩa (bảng công ngày 22 báo "8 ngày cần xem lại" trong
  // khi 8 ngày đó còn chưa xảy ra).
  const daysNeedingReview = days.filter(
    (day) => day.needsExplanation && day.date <= today,
  ).length;
  /*
   * Cột nào tô màu "ngày nghỉ" phải suy từ CA ĐÃ SẮP của chính người này, không
   * mặc định Chủ nhật là nghỉ: có ca làm cả Chủ nhật (mẫu ca tuần / weekday_mask
   * bật bit CN), và ngược lại có người nghỉ vào thứ khác. Máy chủ đã trả
   * `isWorkingDay` theo đúng ca được gán — chỉ đọc lại, không tự suy theo thứ.
   *
   * Một cột chỉ được coi là nghỉ khi MỌI ngày rơi vào cột đó trong tháng đều là
   * ngày nghỉ; tháng có ca xoay (tuần này làm CN, tuần sau nghỉ) thì không cột
   * nào bị tô, đúng bản chất là lịch không cố định theo thứ.
   */
  const restDayColumns = React.useMemo(() => {
    const workingByColumn = new Map<string, boolean>();
    for (const day of days) {
      const label = WEEK_COLUMNS[gridColumnFor(day.date) - 1];
      workingByColumn.set(
        label,
        (workingByColumn.get(label) ?? false) || day.isWorkingDay,
      );
    }
    return new Set(
      [...workingByColumn.entries()]
        .filter(([, hasWorkingDay]) => !hasWorkingDay)
        .map(([label]) => label),
    );
  }, [days]);

  async function handleConfirm() {
    setSubmitting("confirm");
    try {
      await hrApi.confirmMyTimesheet({ month, year });
      toast.success("Đã xác nhận bảng công.");
      await loadTimesheet();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleDispute() {
    if (disputeNote.trim().length < 5) {
      toast.error("Nội dung khiếu nại quá ngắn.");
      return;
    }
    setSubmitting("dispute");
    try {
      await hrApi.disputeMyTimesheet({ month, year, note: disputeNote.trim() });
      toast.success("Đã gửi khiếu nại tới HR.");
      setDisputeNote("");
      await loadTimesheet();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSubmitExplanation() {
    if (!explainingDay?.id) {
      toast.error("Không xác định được ngày cần giải trình.");
      return;
    }
    if (explanationReason.trim().length < 5) {
      toast.error("Nội dung giải trình quá ngắn.");
      return;
    }
    setSubmittingExplanation(true);
    try {
      await hrApi.createAttendanceExplanation({
        timesheetDayId: explainingDay.id,
        type: inferExplanationType(explainingDay),
        reason: explanationReason.trim(),
      });
      toast.success("Đã gửi giải trình chấm công.");
      setExplainingDay(null);
      setExplanationReason("");
      await loadTimesheet();
      await loadExplanations();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmittingExplanation(false);
    }
  }

  async function handleReviewExplanation(
    item: AttendanceExplanation,
    status: "APPROVED" | "REJECTED",
  ) {
    if (!canReviewOnChat) return;
    setReviewingExplanationId(item.id);
    try {
      if (status === "APPROVED") {
        await hrApi.approveAttendanceExplanation(item.id);
        toast.success("Đã duyệt giải trình.");
      } else {
        await hrApi.rejectAttendanceExplanation(item.id);
        toast.success("Đã từ chối giải trình.");
      }
      await loadTimesheet();
      await loadExplanations();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setReviewingExplanationId(null);
    }
  }

  const header = (
    <header className="flex flex-col gap-4 border-b border-[#d7dce3] pb-4">
      {tabBar}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="md:pb-2">
          {tabBar ? null : (
            <h1 className="text-2xl font-semibold tracking-normal text-[#0f172a]">
              Công của tôi
            </h1>
          )}
          <div
            className={`flex flex-wrap items-center gap-2 text-sm text-[#64748b] ${tabBar ? "" : "mt-2"}`}
          >
            <span>{formatMonthTitle(month, year)}</span>
            {period ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{periodStatusLabel[period.status]}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d7dce3] bg-white text-[#334155] hover:bg-[#f8fbff]"
            onClick={() => {
              const previous = new Date(Date.UTC(year, month - 2, 1));
              setMonth(previous.getUTCMonth() + 1);
              setYear(previous.getUTCFullYear());
            }}
            title="Tháng trước"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <TimesheetPeriodPicker
            month={month}
            year={year}
            onMonthChange={setMonth}
            onYearChange={setYear}
          />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d7dce3] bg-white text-[#334155] hover:bg-[#f8fbff]"
            onClick={() => {
              const next = new Date(Date.UTC(year, month, 1));
              setMonth(next.getUTCMonth() + 1);
              setYear(next.getUTCFullYear());
            }}
            title="Tháng sau"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#1976D2]/50 bg-white px-3 text-sm font-medium text-[#1565C0] hover:bg-[#1976D2]/[0.05]"
            onClick={() => void loadTimesheet()}
            disabled={state.status === "loading"}
          >
            <RefreshCcw size={16} aria-hidden="true" />
            Tải lại
          </button>
          <Link
            to={ROUTE_PATHS.TEAM_TIMESHEET}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1565C0] px-3 text-sm font-semibold text-white hover:bg-[#1976D2]"
          >
            <Users size={16} aria-hidden="true" />
            Nhóm của tôi
          </Link>
        </div>
      </div>
    </header>
  );

  return (
    <WorkPageShell header={header}>
      {state.status === "error" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {state.error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Tổng công"
              value={String(data?.summary.totalPaidDays ?? 0)}
            />
            <SummaryTile
              label="Nghỉ phép"
              value={String(data?.summary.totalLeaveDays ?? 0)}
              tone="text-[#0f766e]"
            />
            <SummaryTile
              label="Ngày cần xem lại"
              value={String(daysNeedingReview)}
              tone="text-[#b45309]"
            />
          </div>

          {!period ? (
            <div className="rounded-lg border border-[#d7dce3] bg-white px-4 py-10 text-center">
              <Clock3
                size={28}
                className="mx-auto text-[#64748b]"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium text-[#334155]">
                {data?.message ?? "Chưa có bảng công tháng này."}
              </p>
            </div>
          ) : state.status === "loading" && !days.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 28 }, (_, index) => (
                <div
                  key={index}
                  className="skeleton h-[92px] rounded-lg"
                />
              ))}
            </div>
          ) : (
            <>
              {/*
                Hàng thứ chỉ có nghĩa khi ô thật sự nằm đúng cột của thứ đó,
                nên chỉ hiện từ `lg` — đúng breakpoint mà lưới chuyển sang 7 cột.
              */}
              <div
                className="mb-2 hidden grid-cols-7 gap-2 lg:grid"
                aria-hidden="true"
              >
                {WEEK_COLUMNS.map((label) => (
                  <div
                    key={label}
                    className={`px-1 text-[11px] font-semibold uppercase tracking-wide ${
                      restDayColumns.has(label)
                        ? "text-[#f43f5e]"
                        : "text-[#94a3b8]"
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {days.map((day, index) => (
                  <ExplainableDayCell
                    key={day.date}
                    day={day}
                    isFuture={day.date > today}
                    onExplain={(item) => {
                      setExplainingDay(item);
                      setExplanationReason("");
                    }}
                    // Chỉ ngày đầu tháng cần đẩy vào đúng cột thứ của nó; các
                    // ngày sau tự chảy tiếp. Chỉ áp dụng ở lưới 7 cột.
                    {...(index === 0
                      ? { firstColumn: gridColumnFor(day.date) }
                      : {})}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
            <div className="text-sm font-semibold text-[#0f172a]">Xác nhận</div>
            <div className="mt-3 space-y-2 text-sm text-[#475569]">
              <div className="flex items-center justify-between gap-3">
                <span>Trạng thái</span>
                <span className="font-medium text-[#0f172a]">
                  {confirmation
                    ? confirmationStatusLabel[confirmation.status]
                    : period
                      ? "Chưa xác nhận"
                      : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Hạn xác nhận</span>
                <span className="font-medium text-[#0f172a]">
                  {formatShortDate(period?.confirmDeadline)}
                </span>
              </div>
            </div>

            {confirmation?.status === "CONFIRMED" ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} aria-hidden="true" />
                Đã ghi nhận.
              </div>
            ) : null}

            <button
              type="button"
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-4 text-sm font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
              disabled={!canAct || submitting !== null}
              onClick={() => void handleConfirm()}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              {submitting === "confirm" ? "Đang xác nhận" : "Xác nhận"}
            </button>
          </div>

          <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
            <div className="text-sm font-semibold text-[#0f172a]">
              Khiếu nại
            </div>
            <textarea
              value={disputeNote}
              onChange={(event) => setDisputeNote(event.currentTarget.value)}
              rows={5}
              maxLength={1000}
              disabled={!canAct || submitting !== null}
              className="mt-3 w-full resize-none rounded-lg border border-[#d7dce3] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#1976D2] disabled:bg-[#f8fafc]"
              placeholder="Nội dung gửi HR"
            />
            <button
              type="button"
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#1976D2]/60 bg-white px-4 text-sm font-semibold text-[#1565C0] hover:bg-[#1976D2]/[0.05] disabled:cursor-not-allowed disabled:border-[#d7dce3] disabled:text-[#94a3b8]"
              disabled={!canAct || submitting !== null}
              onClick={() => void handleDispute()}
            >
              <Send size={16} aria-hidden="true" />
              {submitting === "dispute" ? "Đang gửi" : "Gửi HR"}
            </button>
          </div>

          <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#0f172a]">
                Giải trình đã gửi
              </div>
              <span className="text-xs font-medium text-[#64748b]">
                {myExplanations.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {myExplanations.length > 0 ? (
                myExplanations
                  .slice(0, 5)
                  .map((item) => (
                    <MyExplanationItem key={item.id} item={item} />
                  ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#d7dce3] px-3 py-4 text-center text-xs text-[#64748b]">
                  Chưa có đơn giải trình trong tháng này.
                </div>
              )}
            </div>
          </div>

          {canReviewOnChat && pendingExplanations.length > 0 ? (
            <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#0f172a]">
                  Chờ duyệt giải trình
                </div>
                <span className="text-xs font-medium text-[#64748b]">
                  {pendingExplanations.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {pendingExplanations.slice(0, 5).map((item) => (
                  <PendingExplanationItem
                    key={item.id}
                    item={item}
                    reviewingId={reviewingExplanationId}
                    onReview={(target, status) =>
                      void handleReviewExplanation(target, status)
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}

          {explainingDay ? (
            <div className="rounded-lg border border-amber-200 bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Giải trình ngày {dayNumber(explainingDay.date)}
              </div>
              <div className="mt-2 text-xs text-[#64748b]">
                {explainingDay.firstPunch ?? "--:--"} -{" "}
                {explainingDay.lastPunch ?? "--:--"}
              </div>
              <textarea
                value={explanationReason}
                onChange={(event) =>
                  setExplanationReason(event.currentTarget.value)
                }
                rows={5}
                maxLength={1000}
                className="mt-3 w-full resize-none rounded-lg border border-[#d7dce3] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                placeholder="Nội dung giải trình"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-4 text-sm font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                  disabled={submittingExplanation}
                  onClick={() => void handleSubmitExplanation()}
                >
                  <Send size={16} aria-hidden="true" />
                  {submittingExplanation ? "Đang gửi" : "Gửi"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7dce3] bg-white px-4 text-sm font-semibold text-[#334155] hover:bg-[#f8fbff]"
                  onClick={() => {
                    setExplainingDay(null);
                    setExplanationReason("");
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </WorkPageShell>
  );
};

export default MyTimesheetPage;
