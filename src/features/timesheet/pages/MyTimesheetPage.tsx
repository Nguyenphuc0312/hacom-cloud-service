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
import { ShiftCatalogModal } from "../../../components/message/ShiftCodeReference";
import { Modal } from "../../../components/ui";
import { TimesheetSymbolCatalogModal } from "../components/TimesheetSymbolCatalogModal";
import { formatWorkDate } from "../../work/utils/workDatePresentation";
import { TimesheetPeriodPicker } from "../components/TimesheetPeriodPicker";
import { getTimesheetDayScheduleNotice } from "../timesheetDayPresentation";
import { attendanceCalendarLabel } from "../../calendar/utils/attendanceCalendarPresentation";
import {
  canReviewAttendanceOnChat,
  canViewTeamTimesheet,
} from "../../auth/utils/workTimeLeaveCapabilities";
import { useAuthStore } from "../../../stores/authStore";
import {
  shiftCodeClass,
  timesheetSymbolClass,
} from "../timesheetSymbolPresentation";
import {
  datesInMonth,
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
const PENDING_EXPLANATIONS_PAGE_SIZE = 9;

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

const explanationTypeLabel: Record<AttendanceExplanation["type"], string> = {
  MISSING_PUNCH: "Thiếu chấm công",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  OUT_OF_OFFICE: "Đi công tác",
  OTHER: "Khác",
};

const explanationStatusClass = (status: AttendanceExplanation["status"]) => {
  if (status === "APPROVED")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED")
    return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
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

const DayCell: React.FC<{
  day: MyTimesheetDay;
  isFuture?: boolean;
  onShiftCodeSelect: (code: string) => void;
  onSymbolSelect: (code: string) => void;
}> = ({ day, isFuture = false, onShiftCodeSelect, onSymbolSelect }) => {
  const scheduleNotice = getTimesheetDayScheduleNotice(day.source);
  const dayLabel = attendanceCalendarLabel(day);
  const shiftCode = day.shiftCode?.trim() ?? "";
  const isShiftCodeLabel =
    Boolean(shiftCode) && dayLabel.toUpperCase() === shiftCode.toUpperCase();
  const isReferenceSymbol =
    Boolean(dayLabel) && !isShiftCodeLabel && dayLabel !== "?";
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
      data-date={day.date}
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
      ) : dayLabel && isShiftCodeLabel ? (
        <button
          type="button"
          className={`inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/40 ${shiftCodeClass}`}
          aria-label={`Xem thông tin ca ${shiftCode}`}
          onClick={() => onShiftCodeSelect(shiftCode)}
        >
          {dayLabel}
        </button>
      ) : isReferenceSymbol ? (
        <button
          type="button"
          className={`inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/40 ${timesheetSymbolClass(dayLabel)}`}
          aria-label={`Xem thông tin ký hiệu ${dayLabel}`}
          onClick={() => onSymbolSelect(dayLabel)}
        >
          {dayLabel}
        </button>
      ) : dayLabel ? (
        <span
          className={`inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold ${timesheetSymbolClass(dayLabel)}`}
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
  onShiftCodeSelect: (code: string) => void;
  onSymbolSelect: (code: string) => void;
}> = ({
  day,
  isFuture = false,
  firstColumn,
  onExplain,
  onShiftCodeSelect,
  onSymbolSelect,
}) => (
  // Nút xếp dưới ô, không absolute: bản absolute đè lên dòng giờ chấm công
  // (08:05 - 17:35) làm mất thông tin ở đúng những ngày cần đọc kỹ nhất.
  <div
    className={`flex flex-col ${
      firstColumn && firstColumn > 1 ? LG_COLUMN_START[firstColumn] : ""
    }`}
  >
    <DayCell
      day={day}
      isFuture={isFuture}
      onShiftCodeSelect={onShiftCodeSelect}
      onSymbolSelect={onSymbolSelect}
    />
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

const EmptyDayCell: React.FC<{
  date: string;
  isFuture: boolean;
  firstColumn?: number;
}> = ({ date, isFuture, firstColumn }) => {
  const weekdayLabel = WEEKDAY_LABELS[weekdayIndex(date)];

  return (
    <div
      className={`flex flex-col ${
        firstColumn && firstColumn > 1 ? LG_COLUMN_START[firstColumn] : ""
      }`}
    >
      <div
        data-date={date}
        title={`${weekdayLabel} ${formatShortDate(date)} · ${
          isFuture ? "Ngày chưa tới" : "Chưa có dữ liệu chấm công"
        }`}
        className="min-h-[92px] rounded-lg border border-dashed border-[#dbe3ed] bg-[#f8fafc] p-2 text-left"
      >
        <div className="mb-2 flex items-baseline gap-1.5">
          <span
            className={`text-sm font-semibold tabular-nums ${
              isFuture ? "text-[#94a3b8]" : "text-[#475569]"
            }`}
          >
            {dayNumber(date)}
          </span>
          <span className="text-[11px] font-medium text-[#94a3b8]">
            {weekdayLabel}
          </span>
        </div>
        <span className="text-sm text-[#cbd5e1]" aria-hidden="true">
          ···
        </span>
        <div className="mt-2 text-xs text-[#94a3b8]">
          {isFuture ? "Chưa tới" : "Chưa có dữ liệu"}
        </div>
      </div>
    </div>
  );
};

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
    {item.status === "REJECTED" && item.reviewNote ? (
      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs leading-4 text-rose-800">
        <span className="font-semibold">Lý do từ chối:</span> {item.reviewNote}
      </div>
    ) : null}
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
  <article className="flex min-h-[190px] flex-col bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#0f172a]">
          {item.employee?.fullName ?? item.employeeId}
        </div>
        <div className="mt-0.5 text-xs text-[#64748b]">
          {item.employee?.employeeCode ?? "-"} ·{" "}
          {formatShortDate(item.timesheetDay?.workDate)}
        </div>
      </div>
      <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
        {explanationTypeLabel[item.type]}
      </span>
    </div>
    {item.timesheetDay?.firstPunch || item.timesheetDay?.lastPunch ? (
      <div className="mt-3 text-xs font-medium tabular-nums text-[#475569]">
        {item.timesheetDay.firstPunch ?? "--:--"} –{" "}
        {item.timesheetDay.lastPunch ?? "--:--"}
      </div>
    ) : null}
    <div className="mt-2 line-clamp-3 text-sm leading-5 text-[#475569]">
      {item.reason}
    </div>
    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
      <button
        type="button"
        aria-label={`Duyệt giải trình của ${item.employee?.fullName ?? item.employeeId}`}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#1565C0] px-3 text-xs font-semibold text-white outline-none hover:bg-[#1976D2] focus-visible:ring-2 focus-visible:ring-[#1565C0]/40 disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
        disabled={reviewingId !== null}
        onClick={() => onReview(item, "APPROVED")}
      >
        <CheckCircle2 size={14} aria-hidden="true" />
        {reviewingId === item.id ? "Đang xử lý" : "Duyệt"}
      </button>
      <button
        type="button"
        aria-label={`Từ chối giải trình của ${item.employee?.fullName ?? item.employeeId}`}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 outline-none hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:text-[#94a3b8]"
        disabled={reviewingId !== null}
        onClick={() => onReview(item, "REJECTED")}
      >
        <XCircle size={14} aria-hidden="true" />
        Từ chối
      </button>
    </div>
  </article>
);

export const MyTimesheetPage: React.FC<{ tabBar?: React.ReactNode }> = ({
  tabBar,
}) => {
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((auth) => auth.user);
  const canReviewOnChat = canReviewAttendanceOnChat(currentUser);
  const canViewTeamOnChat = canViewTeamTimesheet(currentUser);
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
  const [selectedShiftCode, setSelectedShiftCode] = React.useState<
    string | null
  >(null);
  const [selectedSymbolCode, setSelectedSymbolCode] = React.useState<
    string | null
  >(null);
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
  const [pendingExplanationPage, setPendingExplanationPage] = React.useState(1);
  const [rejectingExplanation, setRejectingExplanation] =
    React.useState<AttendanceExplanation | null>(null);
  const [rejectionNote, setRejectionNote] = React.useState("");
  const rejectionNoteRef = React.useRef<HTMLTextAreaElement | null>(null);

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
  const days = React.useMemo(() => data?.days ?? [], [data?.days]);
  const calendarDates = React.useMemo(
    () => datesInMonth(year, month),
    [month, year],
  );
  const daysByDate = React.useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );
  // Mốc so sánh ngày tương lai. Tính một lần cho cả lưới để mọi ô dùng chung
  // một "hôm nay", tránh lệch nếu render vắt qua nửa đêm.
  const today = React.useMemo(() => todayIso(), []);
  // Bộ đếm phải khớp với số nút "Giải trình" thật sự hiện ra: đếm cả ngày chưa
  // tới thì con số vô nghĩa (bảng công ngày 22 báo "8 ngày cần xem lại" trong
  // khi 8 ngày đó còn chưa xảy ra).
  const daysNeedingReview = days.filter(
    (day) => day.needsExplanation && day.date <= today,
  ).length;
  const pendingExplanationPageCount = Math.max(
    1,
    Math.ceil(pendingExplanations.length / PENDING_EXPLANATIONS_PAGE_SIZE),
  );
  const currentPendingExplanationPage = Math.min(
    pendingExplanationPage,
    pendingExplanationPageCount,
  );
  const pendingPageStart =
    (currentPendingExplanationPage - 1) * PENDING_EXPLANATIONS_PAGE_SIZE;
  const pendingExplanationPageItems = pendingExplanations.slice(
    pendingPageStart,
    pendingPageStart + PENDING_EXPLANATIONS_PAGE_SIZE,
  );
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
    note = "",
  ) {
    if (!canReviewOnChat) return;
    const normalizedNote = note.trim();
    if (status === "REJECTED" && normalizedNote.length < 5) {
      toast.error("Lý do từ chối cần ít nhất 5 ký tự.");
      return;
    }
    setReviewingExplanationId(item.id);
    try {
      if (status === "APPROVED") {
        await hrApi.approveAttendanceExplanation(item.id);
        toast.success("Đã duyệt giải trình.");
      } else {
        await hrApi.rejectAttendanceExplanation(item.id, normalizedNote);
        toast.success("Đã từ chối giải trình.");
        setRejectingExplanation(null);
        setRejectionNote("");
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
          {canViewTeamOnChat ? (
            <Link
              to={ROUTE_PATHS.TEAM_TIMESHEET}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1565C0] px-3 text-sm font-semibold text-white hover:bg-[#1976D2]"
            >
              <Users size={16} aria-hidden="true" />
              Nhóm của tôi
            </Link>
          ) : null}
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

          {state.status === "idle" ||
          (state.status === "loading" && data === null) ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {calendarDates.map((date) => (
                <div key={date} className="skeleton h-[92px] rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {!period ? (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#d7dce3] bg-white px-4 py-3 text-sm text-[#475569]">
                  <Clock3
                    size={18}
                    className="shrink-0 text-[#64748b]"
                    aria-hidden="true"
                  />
                  <p>
                    {data?.message ??
                      "Chưa có bảng công tháng này; lịch vẫn hiển thị đủ để bạn theo dõi."}
                  </p>
                </div>
              ) : null}
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
                {calendarDates.map((date, index) => {
                  const day = daysByDate.get(date);
                  const firstColumn =
                    index === 0 ? gridColumnFor(date) : undefined;

                  return day ? (
                    <ExplainableDayCell
                      key={date}
                      day={day}
                      isFuture={date > today}
                      onExplain={(item) => {
                        setExplainingDay(item);
                        setExplanationReason("");
                      }}
                      onShiftCodeSelect={setSelectedShiftCode}
                      onSymbolSelect={setSelectedSymbolCode}
                      {...(firstColumn ? { firstColumn } : {})}
                    />
                  ) : (
                    <EmptyDayCell
                      key={date}
                      date={date}
                      isFuture={date > today}
                      {...(firstColumn ? { firstColumn } : {})}
                    />
                  );
                })}
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

      {canReviewOnChat && pendingExplanations.length > 0 ? (
        <section
          aria-labelledby="pending-explanations-title"
          className="overflow-hidden rounded-xl border border-[#d7dce3] bg-white"
        >
          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2
                id="pending-explanations-title"
                className="text-base font-semibold text-[#0f172a]"
              >
                Chờ duyệt giải trình
              </h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Kiểm tra ngày công và lý do trước khi quyết định.
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingExplanations.length} yêu cầu
            </span>
          </div>
          <div className="grid gap-px border-t border-[#e2e8f0] bg-[#e2e8f0] sm:grid-cols-2 xl:grid-cols-3">
            {pendingExplanationPageItems.map((item) => (
              <PendingExplanationItem
                key={item.id}
                item={item}
                reviewingId={reviewingExplanationId}
                onReview={(target, status) => {
                  if (status === "REJECTED") {
                    setRejectingExplanation(target);
                    setRejectionNote("");
                    return;
                  }
                  void handleReviewExplanation(target, status);
                }}
              />
            ))}
          </div>
          {pendingExplanationPageCount > 1 ? (
            <footer className="flex flex-col gap-3 border-t border-[#e2e8f0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span
                className="text-sm text-[#64748b]"
                role="status"
                aria-live="polite"
              >
                {pendingExplanations.length} bản ghi · Trang{" "}
                {currentPendingExplanationPage}/{pendingExplanationPageCount}
              </span>
              <nav
                className="flex flex-wrap items-center gap-1"
                aria-label="Phân trang giải trình chờ duyệt"
              >
                <button
                  type="button"
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[#d7dce3] bg-white px-2 text-sm text-[#475569] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 disabled:cursor-not-allowed disabled:text-[#cbd5e1]"
                  aria-label="Trang trước"
                  disabled={
                    currentPendingExplanationPage === 1 ||
                    reviewingExplanationId !== null
                  }
                  onClick={() =>
                    setPendingExplanationPage(currentPendingExplanationPage - 1)
                  }
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                {Array.from(
                  { length: pendingExplanationPageCount },
                  (_, index) => index + 1,
                ).map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 ${
                      page === currentPendingExplanationPage
                        ? "border-[#1565C0] bg-[#1565C0] text-white"
                        : "border-[#d7dce3] bg-white text-[#475569] hover:bg-[#f8fbff]"
                    }`}
                    aria-label={`Trang ${page}`}
                    aria-current={
                      page === currentPendingExplanationPage
                        ? "page"
                        : undefined
                    }
                    disabled={reviewingExplanationId !== null}
                    onClick={() => setPendingExplanationPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[#d7dce3] bg-white px-2 text-sm text-[#475569] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 disabled:cursor-not-allowed disabled:text-[#cbd5e1]"
                  aria-label="Trang sau"
                  disabled={
                    currentPendingExplanationPage ===
                      pendingExplanationPageCount ||
                    reviewingExplanationId !== null
                  }
                  onClick={() =>
                    setPendingExplanationPage(currentPendingExplanationPage + 1)
                  }
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            </footer>
          ) : null}
        </section>
      ) : null}
      {selectedShiftCode ? (
        <ShiftCatalogModal
          code={selectedShiftCode}
          onClose={() => setSelectedShiftCode(null)}
        />
      ) : null}
      {selectedSymbolCode ? (
        <TimesheetSymbolCatalogModal
          code={selectedSymbolCode}
          onClose={() => setSelectedSymbolCode(null)}
        />
      ) : null}
      {rejectingExplanation ? (
        <Modal
          isOpen
          onClose={() => {
            if (reviewingExplanationId === null) {
              setRejectingExplanation(null);
              setRejectionNote("");
            }
          }}
          title="Từ chối giải trình"
          description={`${rejectingExplanation.employee?.fullName ?? rejectingExplanation.employeeId} · ${formatShortDate(rejectingExplanation.timesheetDay?.workDate)}`}
          size="md"
          closeOnOverlayClick={reviewingExplanationId === null}
          closeOnEsc={reviewingExplanationId === null}
          initialFocusRef={rejectionNoteRef}
        >
          <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fbff] px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Nội dung giải trình
            </div>
            <p className="mt-1 text-sm leading-5 text-[#334155]">
              {rejectingExplanation.reason}
            </p>
          </div>
          <label
            className="mt-4 block text-sm font-semibold text-[#0f172a]"
            htmlFor="attendance-rejection-note"
          >
            Lý do từ chối <span className="text-rose-600">*</span>
          </label>
          <p className="mt-1 text-xs text-[#64748b]">
            Người gửi sẽ thấy nội dung này. Nhập từ 5 đến 1.000 ký tự.
          </p>
          <textarea
            ref={rejectionNoteRef}
            id="attendance-rejection-note"
            value={rejectionNote}
            onChange={(event) => setRejectionNote(event.currentTarget.value)}
            rows={5}
            maxLength={1000}
            aria-required="true"
            aria-invalid={
              rejectionNote.length > 0 && rejectionNote.trim().length < 5
                ? "true"
                : "false"
            }
            className="mt-2 w-full resize-none rounded-lg border border-[#d7dce3] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#1976D2] focus:ring-2 focus:ring-[#1976D2]/15 disabled:bg-[#f8fafc]"
            placeholder="Nêu rõ căn cứ hoặc thông tin cần bổ sung"
            disabled={reviewingExplanationId !== null}
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-xs">
            <span
              className={
                rejectionNote.length > 0 && rejectionNote.trim().length < 5
                  ? "text-rose-600"
                  : "text-[#64748b]"
              }
            >
              {rejectionNote.length > 0 && rejectionNote.trim().length < 5
                ? "Lý do từ chối cần ít nhất 5 ký tự."
                : "Bắt buộc nhập lý do trước khi từ chối."}
            </span>
            <span className="shrink-0 tabular-nums text-[#64748b]">
              {rejectionNote.length}/1.000
            </span>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7dce3] bg-white px-4 text-sm font-semibold text-[#334155] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 disabled:cursor-not-allowed disabled:text-[#94a3b8]"
              disabled={reviewingExplanationId !== null}
              onClick={() => {
                setRejectingExplanation(null);
                setRejectionNote("");
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
              disabled={
                rejectionNote.trim().length < 5 ||
                reviewingExplanationId !== null
              }
              onClick={() =>
                void handleReviewExplanation(
                  rejectingExplanation,
                  "REJECTED",
                  rejectionNote,
                )
              }
            >
              <XCircle size={16} aria-hidden="true" />
              {reviewingExplanationId === rejectingExplanation.id
                ? "Đang từ chối"
                : "Xác nhận từ chối"}
            </button>
          </div>
        </Modal>
      ) : null}
    </WorkPageShell>
  );
};

export default MyTimesheetPage;
