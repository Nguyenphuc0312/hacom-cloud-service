import React from "react";
import toast from "react-hot-toast";
import {
  Ban,
  CalendarCheck2,
  Check,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  X,
} from "lucide-react";

import {
  hrApi,
  type LeaveBalance,
  type LeaveHalfDaySession,
  type LeaveRequest,
  type LeaveReplacementCandidate,
  type LeaveType,
  type MyLeaveResponse,
  type PendingLeaveApprovalsResponse,
  type WorkflowStatus,
} from "../../api/hrApi";
import {
  countCalendarLeaveDays,
  type LeaveDayPortion,
} from "../utils/leaveDays";
import { getLeaveDurationErrorMessage } from "../utils/leaveDurationErrorMessage";
import {
  collectBlockingIssues,
  getNoticeStatus,
  needsSickAttachmentHint,
  SICK_ATTACHMENT_MIN_DAYS,
} from "../utils/leaveRules";
import { formatWorkDate } from "../../work/utils/workDatePresentation";
import { DateFieldVN } from "../../../components/ui/DateFieldVN";
import { isoToVn, vnToIso } from "../../../components/ui/dateFieldVNUtils";
import { WorkPageShell } from "../../work/components/WorkPageShell";
import { isSuperAdmin } from "../../auth/utils/isSuperAdmin";
import { useAuthStore } from "../../../stores/authStore";

type LoadState =
  | { status: "idle" | "loading"; data: MyLeaveResponse | null; error: null }
  | { status: "success"; data: MyLeaveResponse; error: null }
  | { status: "error"; data: MyLeaveResponse | null; error: string };

const now = new Date();
const pendingApprovalPageSize = 50;
const today = now.toISOString().slice(0, 10);

const leaveTypeLabel: Record<LeaveType, string> = {
  ANNUAL: "Phép năm",
  SICK: "Ốm đau",
  UNPAID: "Không lương",
  MARRIAGE: "Cưới hỏi",
  MATERNITY: "Thai sản",
  OTHER: "Khác",
};

const statusLabel: Record<WorkflowStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};

const statusClass = (status: WorkflowStatus) => {
  if (status === "APPROVED")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED")
    return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "SUBMITTED")
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const currentApprovalStep = (request: LeaveRequest) =>
  request.status === "SUBMITTED"
    ? (request.currentApprovalStep ??
      request.approvalSteps?.find((step) => step.status === "SUBMITTED") ??
      null)
    : null;

const toHalfDaySession = (portion: LeaveDayPortion): LeaveHalfDaySession => {
  if (portion === "AM") return "MORNING";
  if (portion === "PM") return "AFTERNOON";
  return "FULL_DAY";
};

const halfDaySessionLabel = (value?: LeaveHalfDaySession | null) => {
  if (value === "MORNING") return "Sáng";
  if (value === "AFTERNOON") return "Chiều";
  return "Cả ngày";
};

/** Gợi ý chứng từ theo từng loại nghỉ — thay vì luôn nói "nghỉ ốm". */
const attachmentHint: Record<LeaveType, string> = {
  ANNUAL: "Không bắt buộc",
  SICK: `Bắt buộc khi nghỉ từ ${SICK_ATTACHMENT_MIN_DAYS} ngày (giấy khám bệnh…)`,
  UNPAID: "Không bắt buộc",
  MARRIAGE: "Không bắt buộc (thiệp cưới, giấy đăng ký kết hôn…)",
  MATERNITY: "Không bắt buộc (giấy khám thai, giấy chứng sinh…)",
  OTHER: "Không bắt buộc",
};

const NoticeWarning: React.FC<{ request: LeaveRequest }> = ({ request }) => {
  if (!request.lateSubmission) return null;

  return (
    <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
      Gửi muộn: {request.noticeActualDays ?? "-"} /{" "}
      {request.noticeRequiredDays ?? "-"} ngày báo trước
    </div>
  );
};

const formatDate = (value: string) => formatWorkDate(value);

const formatDays = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toLocaleString("vi-VN");

const balanceSourceLabel = (source: LeaveBalance["source"]) => {
  if (source === "RECONCILED_LEAVE_LEDGER") return "Quỹ phép đã đối chiếu";
  if (source === "TIMESHEET_P_SYMBOL") return "Từ ký hiệu P";
  if (source === "TIMESHEET_OM_SYMBOL") return "Từ ký hiệu OM";
  if (source === "TIMESHEET_KL_SYMBOL") return "Từ ký hiệu KL";
  return "Từ đơn đã duyệt";
};

const leaveModeLabel = (data: MyLeaveResponse | null) => {
  if (!data) return "Đang tải quỹ phép";
  if (data.mode === "EMPLOYEE_NOT_LINKED") return "Chưa liên kết HR";
  if (data.mode === "LIVE") return "Số dư đã đối chiếu trên HRM";
  return "Số dư đang được HR đối chiếu";
};

const extractErrorMessage = (error: unknown) => {
  const leaveDurationMessage = getLeaveDurationErrorMessage(error);
  if (leaveDurationMessage) return leaveDurationMessage;
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  const normalizedMessage = Array.isArray(message)
    ? message.join(" ")
    : (message ?? "");
  if (normalizedMessage.includes("RETROACTIVE_LEAVE_LIMIT_EXCEEDED")) {
    return "Chỉ được khai lùi đơn nghỉ tối đa 3 ngày.";
  }
  if (normalizedMessage.includes("SICK_LEAVE_ATTACHMENT_REQUIRED")) {
    return "Nghỉ ốm từ 3 ngày cần có chứng từ đính kèm.";
  }
  if (
    normalizedMessage.includes(
      "ANNUAL_LEAVE_CROSS_YEAR_REQUIRES_HR_CONFIRMATION",
    )
  ) {
    return "Đơn phép năm đi qua hai năm cần HR xác nhận và tách kỳ phép.";
  }
  if (normalizedMessage.includes("ANNUAL_LEAVE_BALANCE_NOT_RECONCILED")) {
    return "Quỹ phép năm chưa được HR đối chiếu nên chưa thể gửi đơn.";
  }
  if (normalizedMessage.includes("LEAVE_REPLACEMENT_CANNOT_BE_SELF")) {
    return "Người nhận bàn giao phải là một nhân sự khác.";
  }
  if (normalizedMessage.includes("LEAVE_REPLACEMENT_EMPLOYEE_INVALID")) {
    return "Người nhận bàn giao không còn hợp lệ hoặc không cùng phòng ban.";
  }
  if (normalizedMessage.includes("LEAVE_REQUEST_OVERLAPS_APPROVED_LEAVE")) {
    return "Khoảng nghỉ bị trùng với một đơn đã duyệt của nhân sự.";
  }
  if (status === 422)
    return "Tài khoản chưa liên kết hồ sơ nhân sự hoặc dữ liệu chưa hợp lệ.";
  if (status === 409) return "Trạng thái đơn nghỉ phép đã thay đổi.";
  return "Không tải được dữ liệu nghỉ phép lúc này.";
};

const BalanceCard: React.FC<{ balance: LeaveBalance; isActive?: boolean }> = ({
  balance,
  isActive = false,
}) => (
  // Thẻ của loại đang khai được làm nổi để thấy ngay quỹ còn lại của ĐÚNG loại
  // đó, thay vì phải quét mắt qua cả bốn thẻ.
  <div
    aria-current={isActive ? "true" : undefined}
    className={`rounded-lg border bg-white p-4 transition-colors motion-safe:duration-200 ${
      isActive
        ? "border-[#1976D2] bg-[#1976D2]/[0.04] ring-1 ring-[#1976D2]/30"
        : "border-[#d7dce3]"
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#0f172a]">
          {leaveTypeLabel[balance.leaveType] ?? balance.label}
        </div>
        <div className="mt-1 text-xs text-[#64748b]">
          {balanceSourceLabel(balance.source)}
        </div>
      </div>
      <CalendarCheck2
        size={18}
        className={isActive ? "text-[#1565C0]" : "text-[#94a3b8]"}
        aria-hidden="true"
      />
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
      <div>
        <div className="text-xs text-[#64748b]">Đã dùng</div>
        <div className="mt-1 font-semibold text-[#0f172a]">
          {formatDays(balance.usedDays)}
        </div>
      </div>
      <div>
        <div className="text-xs text-[#64748b]">Chờ duyệt</div>
        <div className="mt-1 font-semibold text-amber-700">
          {formatDays(balance.pendingDays)}
        </div>
      </div>
      <div>
        <div className="text-xs text-[#64748b]">Còn lại</div>
        <div className="mt-1 font-semibold text-[#1565C0]">
          {balance.remainingDays === null
            ? "Đối chiếu"
            : formatDays(balance.remainingDays)}
        </div>
      </div>
    </div>
  </div>
);

const RequestRow: React.FC<{
  request: LeaveRequest;
  busy?: boolean;
  onCancel?: (request: LeaveRequest) => void;
}> = ({ request, busy = false, onCancel }) => (
  <tr className="border-b border-[#e2e8f0] last:border-0">
    <td className="min-w-[150px] px-4 py-3">
      <div className="font-medium text-[#0f172a]">
        {leaveTypeLabel[request.leaveType]}
      </div>
      <div className="text-xs text-[#64748b]">
        {formatDays(request.totalDays)} ngày
      </div>
      {request.leaveType === "ANNUAL" ? (
        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-[#1565C0]">
          <span>
            {formatDays(request.annualPaidDays ?? request.totalDays)} P
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatDays(request.unpaidDays ?? 0)} KL</span>
        </div>
      ) : null}
    </td>
    <td className="min-w-[190px] px-4 py-3 text-sm text-[#475569]">
      {formatDate(request.startDate)} - {formatDate(request.endDate)}
      <div className="mt-1 text-xs text-[#64748b]">
        Buổi: {halfDaySessionLabel(request.startHalfDaySession)} -{" "}
        {halfDaySessionLabel(request.endHalfDaySession)}
      </div>
      <NoticeWarning request={request} />
    </td>
    <td className="min-w-[220px] px-4 py-3 text-sm text-[#475569]">
      {request.replacementEmployee ? (
        <div className="mt-1 text-xs text-[#64748b]">
          Bàn giao: {request.replacementEmployee.fullName} ·{" "}
          {request.replacementEmployee.employeeCode}
        </div>
      ) : null}
      {request.reason || "-"}
    </td>
    <td className="px-4 py-3">
      <span
        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(request.status)}`}
      >
        {statusLabel[request.status]}
      </span>
      {currentApprovalStep(request) ? (
        <div className="mt-1 text-xs text-[#64748b]">
          Cấp {currentApprovalStep(request)?.stepOrder}:{" "}
          {currentApprovalStep(request)?.stepName}
        </div>
      ) : null}
    </td>
    <td className="px-4 py-3 text-right">
      {request.status === "DRAFT" || request.status === "SUBMITTED" ? (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
          disabled={busy}
          onClick={() => onCancel?.(request)}
        >
          <Ban size={15} aria-hidden="true" />
          Hủy
        </button>
      ) : null}
    </td>
  </tr>
);

const ApprovalRow: React.FC<{
  request: LeaveRequest;
  busy?: boolean;
  onApprove: (request: LeaveRequest) => void;
  onReject: (request: LeaveRequest) => void;
}> = ({ request, busy = false, onApprove, onReject }) => (
  <div className="rounded-lg border border-[#e2e8f0] bg-white p-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-medium text-[#0f172a]">
          {request.employee?.fullName ?? request.employeeId}
        </div>
        <div className="mt-1 text-xs text-[#64748b]">
          {leaveTypeLabel[request.leaveType]} · {formatDays(request.totalDays)}{" "}
          ngày
        </div>
      </div>
      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        {currentApprovalStep(request)
          ? `Cấp ${currentApprovalStep(request)?.stepOrder}`
          : "Chờ duyệt"}
      </span>
    </div>
    <div className="mt-2 text-sm text-[#475569]">
      {formatDate(request.startDate)} - {formatDate(request.endDate)}
    </div>
    <div className="mt-1 text-xs text-[#64748b]">
      Buoi: {halfDaySessionLabel(request.startHalfDaySession)} -{" "}
      {halfDaySessionLabel(request.endHalfDaySession)}
    </div>
    <NoticeWarning request={request} />
    {request.leaveType === "ANNUAL" ? (
      <div className="mt-1 text-xs font-medium text-[#1565C0]">
        Phân bổ: {formatDays(request.annualPaidDays ?? request.totalDays)} P ·{" "}
        {formatDays(request.unpaidDays ?? 0)} KL
      </div>
    ) : null}
    {request.replacementEmployee ? (
      <div className="mt-1 text-xs text-[#64748b]">
        Bàn giao cho {request.replacementEmployee.fullName} ·{" "}
        {request.replacementEmployee.employeeCode}
      </div>
    ) : null}
    {request.reason ? (
      <div className="mt-1 line-clamp-2 text-sm text-[#64748b]">
        {request.reason}
      </div>
    ) : null}
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-3 text-sm font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
        disabled={busy}
        onClick={() => onApprove(request)}
      >
        <Check size={15} aria-hidden="true" />
        Duyệt
      </button>
      <button
        type="button"
        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm font-semibold text-[#334155] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:text-[#94a3b8]"
        disabled={busy}
        onClick={() => onReject(request)}
      >
        <X size={15} aria-hidden="true" />
        Từ chối
      </button>
    </div>
  </div>
);

export const MyLeavePage: React.FC<{ tabBar?: React.ReactNode }> = ({
  tabBar,
}) => {
  const currentUser = useAuthStore((auth) => auth.user);
  const canReviewOnChat = isSuperAdmin(currentUser);
  const [year, setYear] = React.useState(now.getFullYear());
  const [state, setState] = React.useState<LoadState>({
    status: "idle",
    data: null,
    error: null,
  });
  const [approvals, setApprovals] =
    React.useState<PendingLeaveApprovalsResponse | null>(null);
  const [approvalPage, setApprovalPage] = React.useState(1);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    leaveType: "ANNUAL" as LeaveType,
    startDate: today,
    endDate: today,
    startPortion: "FULL" as LeaveDayPortion,
    endPortion: "FULL" as LeaveDayPortion,
    reason: "",
    attachmentUrl: "",
    replacementEmployeeId: "",
  });
  const [replacementSearch, setReplacementSearch] = React.useState("");
  const [replacementCandidates, setReplacementCandidates] = React.useState<
    LeaveReplacementCandidate[]
  >([]);
  const [replacementLoading, setReplacementLoading] = React.useState(false);

  // Nháp dd/mm/yyyy cho hai ô ngày: giữ nguyên chữ đang gõ dở ("05/0…") thay vì
  // ép về form (form chỉ nhận ISO hợp lệ, nếu không countCalendarLeaveDays sẽ vỡ).
  const [dateDraft, setDateDraft] = React.useState<{
    start: string | null;
    end: string | null;
  }>({
    start: null,
    end: null,
  });

  // Ước lượng theo LỊCH. Server mới tính số ngày thật theo ca đã phân của
  // nhân viên (bỏ cuối tuần/ngày lễ), nên con số này chỉ để hiển thị tạm và
  // chặn khoảng ngày vô lý — không được gửi lên như số ngày chính thức.
  const estimatedDays = React.useMemo(
    () =>
      countCalendarLeaveDays(
        form.startDate,
        form.endDate,
        form.startPortion,
        form.endPortion,
      ),
    [form.endDate, form.endPortion, form.startDate, form.startPortion],
  );

  const attachmentRequired = needsSickAttachmentHint({
    leaveType: form.leaveType,
    estimatedDays,
    attachmentUrl: form.attachmentUrl,
  });

  // Lỗi CHẶN (BE sẽ từ chối) và cảnh báo báo muộn (BE chỉ gắn cờ) — tách riêng
  // để hai thứ không trông giống nhau: hồng = không gửi được, hổ phách = nên biết.
  const blockingIssues = React.useMemo(
    () =>
      collectBlockingIssues({
        startDate: form.startDate,
        endDate: form.endDate,
        startPortion: form.startPortion,
        endPortion: form.endPortion,
        totalDays: estimatedDays,
        leaveType: form.leaveType,
        attachmentUrl: form.attachmentUrl,
      }),
    [form, estimatedDays],
  );
  const attachmentMissing = attachmentRequired;
  const dateIssues = blockingIssues;
  const notice = React.useMemo(
    () => getNoticeStatus(form.startDate, estimatedDays),
    [form.startDate, estimatedDays],
  );
  const showLateNotice =
    Boolean(notice?.lateSubmission) && dateIssues.length === 0;

  const loadApprovals = React.useCallback(async (page = 1) => {
    if (!canReviewOnChat) {
      setApprovals(null);
      return null;
    }
    try {
      const pending = await hrApi.getPendingLeaveApprovals({
        page,
        pageSize: pendingApprovalPageSize,
      });
      setApprovals(pending);
      return pending;
    } catch {
      setApprovals(null);
      return null;
    }
  }, [canReviewOnChat]);

  const loadLeave = React.useCallback(
    async (refreshApprovals = true) => {
      setState((current) => ({
        status: "loading",
        data: current.data,
        error: null,
      }));
      try {
        const data = await hrApi.getMyLeave({ year });
        setState({ status: "success", data, error: null });
      } catch (error) {
        setState((current) => ({
          status: "error",
          data: current.data,
          error: extractErrorMessage(error),
        }));
      }
      if (refreshApprovals) {
        void loadApprovals(approvalPage);
      }
    },
    [approvalPage, loadApprovals, year],
  );

  React.useEffect(() => {
    void loadLeave();
  }, [loadLeave]);

  React.useEffect(() => {
    const search = replacementSearch.trim();
    if (search.length < 2 || form.replacementEmployeeId) {
      setReplacementCandidates([]);
      setReplacementLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setReplacementLoading(true);
      void hrApi
        .searchMyLeaveReplacementCandidates(search, 10)
        .then((items) => {
          if (!cancelled) setReplacementCandidates(items);
        })
        .catch(() => {
          if (!cancelled) setReplacementCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setReplacementLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.replacementEmployeeId, replacementSearch]);

  const data = state.data;
  const requests = data?.requests ?? [];
  const balances = data?.balances ?? [];

  const annualRemainingDays = balances.find(
    (balance) => balance.leaveType === "ANNUAL",
  )?.remainingDays;
  const estimatedAnnualAllocation =
    form.leaveType === "ANNUAL" &&
    annualRemainingDays !== null &&
    annualRemainingDays !== undefined
      ? (() => {
          const available =
            Math.floor(Math.max(0, annualRemainingDays) * 2) / 2;
          const paid = Math.min(estimatedDays, available);
          return { paid, unpaid: Math.max(0, estimatedDays - paid) };
        })()
      : null;
  async function handleCreate() {
    if (estimatedDays <= 0) {
      toast.error("Khoảng ngày nghỉ chưa hợp lệ.");
      return;
    }
    if (blockingIssues.length > 0) {
      toast.error(blockingIssues[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const created = await hrApi.createMyLeaveRequest({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        startHalfDaySession: toHalfDaySession(form.startPortion),
        endHalfDaySession: toHalfDaySession(form.endPortion),
        reason: form.reason.trim() || undefined,
        attachmentUrl: form.attachmentUrl.trim() || undefined,
        replacementEmployeeId: form.replacementEmployeeId || undefined,
      });
      if (
        created.leaveType === "ANNUAL" &&
        created.annualPaidDays !== null &&
        created.annualPaidDays !== undefined
      ) {
        toast.success(
          `Đã gửi đơn: ${formatDays(created.annualPaidDays)} ngày P, ` +
            `${formatDays(created.unpaidDays ?? 0)} ngày KL.`,
        );
      } else {
        toast.success("Đã gửi đơn nghỉ phép.");
      }
      setForm((current) => ({
        ...current,
        reason: "",
        attachmentUrl: "",
        replacementEmployeeId: "",
      }));
      setReplacementSearch("");
      await loadLeave();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(request: LeaveRequest) {
    setBusyId(request.id);
    try {
      await hrApi.cancelMyLeaveRequest(request.id);
      toast.success("Đã hủy đơn nghỉ phép.");
      await loadLeave();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproval(
    request: LeaveRequest,
    action: "approve" | "reject",
  ) {
    if (!canReviewOnChat) return;
    setBusyId(request.id);
    try {
      if (action === "approve") {
        await hrApi.approveLeaveRequest(request.id);
        toast.success("Đã duyệt đơn nghỉ phép.");
      } else {
        await hrApi.rejectLeaveRequest(request.id);
        toast.success("Đã từ chối đơn nghỉ phép.");
      }
      await loadLeave(false);
      const refreshed = await loadApprovals(approvalPage);
      if (
        refreshed?.items.length === 0 &&
        refreshed.pagination.hasPreviousPage
      ) {
        const previousPage = approvalPage - 1;
        setApprovalPage(previousPage);
        await loadApprovals(previousPage);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const header = (
    <header className="flex flex-col gap-4 border-b border-[#d7dce3] pb-4">
      {tabBar}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="md:pb-2">
          {tabBar ? null : (
            <h1 className="text-2xl font-semibold tracking-normal text-[#0f172a]">
              Nghỉ phép của tôi
            </h1>
          )}
          <div
            className={`flex flex-wrap items-center gap-2 text-sm text-[#64748b] ${tabBar ? "" : "mt-2"}`}
          >
            <span>Năm {year}</span>
            <span aria-hidden="true">·</span>
            <span>{leaveModeLabel(data)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-[#475569]">
            <span>Năm</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) =>
                setYear(Number(event.currentTarget.value) || now.getFullYear())
              }
              className="h-10 w-28 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
            />
          </label>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#1976D2]/50 bg-white px-3 text-sm font-medium text-[#1565C0] hover:bg-[#1976D2]/[0.05]"
            onClick={() => void loadLeave()}
            disabled={state.status === "loading"}
          >
            <RefreshCcw size={16} aria-hidden="true" />
            Tải lại
          </button>
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {balances.length > 0 ? (
              balances.map((balance) => (
                <BalanceCard
                  key={balance.leaveType}
                  balance={balance}
                  isActive={balance.leaveType === form.leaveType}
                />
              ))
            ) : (
              <div className="rounded-lg border border-[#d7dce3] bg-white px-4 py-10 text-center text-sm text-[#64748b] sm:col-span-2 xl:col-span-4">
                {data?.message ?? "Chưa có dữ liệu quỹ phép."}
              </div>
            )}
          </div>

          <section className="overflow-hidden rounded-lg border border-[#d7dce3] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#0f172a]">
                Đơn nghỉ phép
              </h2>
              {state.status === "loading" ? (
                <Loader2
                  size={16}
                  className="animate-spin text-[#64748b]"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            {requests.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-[#64748b]">
                Chưa có đơn nghỉ phép trong năm này.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Loại nghỉ</th>
                      <th className="px-4 py-3 font-semibold">Thời gian</th>
                      <th className="px-4 py-3 font-semibold">Lý do</th>
                      <th className="px-4 py-3 font-semibold">Trạng thái</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => (
                      <RequestRow
                        key={request.id}
                        request={request}
                        busy={busyId === request.id}
                        onCancel={(item) => void handleCancel(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-[#d7dce3] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0f172a]">
              Gửi đơn nghỉ
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-[#475569]">
                <span>Loại nghỉ</span>
                <select
                  value={form.leaveType}
                  onChange={(event) => {
                    // Đọc value TRƯỚC khi vào updater: updater của setState chạy
                    // sau, lúc đó React đã gỡ currentTarget → null.value nổ.
                    const next = event.currentTarget.value as LeaveType;
                    setForm((current) => ({ ...current, leaveType: next }));
                  }}
                  className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                >
                  {Object.entries(leaveTypeLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* State giữ ISO (BE nhận ISO, và so sánh chuỗi start>end chỉ
                      đúng với ISO); chỉ lớp hiển thị là dd/mm/yyyy. */}
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Từ ngày</span>
                  <DateFieldVN
                    value={dateDraft.start ?? isoToVn(form.startDate)}
                    ariaLabel="Từ ngày"
                    wrapClassName="h-10 rounded-lg border border-[#d7dce3] bg-white pr-1 focus-within:border-[#1976D2]"
                    className="h-full w-full min-w-0 rounded-lg bg-transparent px-3 text-sm text-[#0f172a] outline-none"
                    onChange={(vn) => {
                      const iso = vnToIso(vn);
                      setDateDraft((d) => ({ ...d, start: iso ? null : vn }));
                      if (!iso) return;
                      setForm((current) => ({
                        ...current,
                        startDate: iso,
                        endDate: current.endDate < iso ? iso : current.endDate,
                      }));
                    }}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Đến ngày</span>
                  <DateFieldVN
                    value={dateDraft.end ?? isoToVn(form.endDate)}
                    ariaLabel="Đến ngày"
                    wrapClassName="h-10 rounded-lg border border-[#d7dce3] bg-white pr-1 focus-within:border-[#1976D2]"
                    className="h-full w-full min-w-0 rounded-lg bg-transparent px-3 text-sm text-[#0f172a] outline-none"
                    onChange={(vn) => {
                      const iso = vnToIso(vn);
                      setDateDraft((d) => ({ ...d, end: iso ? null : vn }));
                      if (iso)
                        setForm((current) => ({ ...current, endDate: iso }));
                    }}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Buổi đầu</span>
                  <select
                    value={form.startPortion}
                    onChange={(event) => {
                      const next = event.currentTarget.value as LeaveDayPortion;
                      setForm((current) => ({
                        ...current,
                        startPortion: next,
                      }));
                    }}
                    className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                  >
                    <option value="FULL">Cả ngày</option>
                    <option value="AM">Sáng</option>
                    <option value="PM">Chiều</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Buổi cuối</span>
                  <select
                    value={form.endPortion}
                    onChange={(event) => {
                      const next = event.currentTarget.value as LeaveDayPortion;
                      setForm((current) => ({ ...current, endPortion: next }));
                    }}
                    className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                  >
                    <option value="FULL">Cả ngày</option>
                    <option value="AM">Sáng</option>
                    <option value="PM">Chiều</option>
                  </select>
                </label>
              </div>
              {dateIssues.length > 0 ? (
                <div
                  role="alert"
                  className="grid gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                >
                  {dateIssues.map((issue) => (
                    <span key={issue.code}>{issue.message}</span>
                  ))}
                </div>
              ) : null}

              {showLateNotice && notice ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Nghỉ khoảng {formatDays(estimatedDays)} ngày cần báo trước{" "}
                  <span className="font-semibold">
                    {notice.requiredDays} ngày
                  </span>
                  , đơn này
                  {notice.actualDays < 0
                    ? " khai lùi về quá khứ"
                    : ` chỉ báo trước ${notice.actualDays} ngày`}
                  . Vẫn gửi được, nhưng đơn sẽ bị đánh dấu gửi muộn.
                </div>
              ) : null}

              <label className="grid gap-1 text-sm font-medium text-[#475569]">
                <span>Lý do</span>
                <textarea
                  value={form.reason}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setForm((current) => ({ ...current, reason: next }));
                  }}
                  rows={4}
                  maxLength={1000}
                  className="resize-none rounded-lg border border-[#d7dce3] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                />
              </label>
              <div className="grid gap-1">
                <label
                  htmlFor="leave-replacement-search"
                  className="text-sm font-medium text-[#475569]"
                >
                  Người nhận bàn giao
                  <span className="ml-1 text-xs font-normal text-[#94a3b8]">
                    (không bắt buộc)
                  </span>
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-3 text-[#94a3b8]"
                    aria-hidden="true"
                  />
                  <input
                    id="leave-replacement-search"
                    type="search"
                    aria-label="Người nhận bàn giao"
                    value={replacementSearch}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      setReplacementSearch(next);
                      setForm((current) => ({
                        ...current,
                        replacementEmployeeId: "",
                      }));
                    }}
                    placeholder="Nhập ít nhất 2 ký tự tên hoặc mã nhân sự"
                    autoComplete="off"
                    aria-expanded={replacementCandidates.length > 0}
                    aria-controls="leave-replacement-options"
                    className="h-10 w-full rounded-lg border border-[#d7dce3] bg-white pl-9 pr-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                  />
                </div>
                {replacementLoading ? (
                  <span className="text-xs text-[#64748b]">
                    Đang tìm trong phòng ban…
                  </span>
                ) : null}
                {replacementCandidates.length > 0 ? (
                  <div
                    id="leave-replacement-options"
                    role="listbox"
                    className="max-h-48 overflow-y-auto rounded-lg border border-[#d7dce3] bg-white p-1"
                  >
                    {replacementCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        role="option"
                        aria-selected={
                          form.replacementEmployeeId === candidate.id
                        }
                        className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-[#f0f7ff]"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            replacementEmployeeId: candidate.id,
                          }));
                          setReplacementSearch(candidate.fullName);
                          setReplacementCandidates([]);
                        }}
                      >
                        <span className="text-sm font-medium text-[#0f172a]">
                          {candidate.fullName}
                        </span>
                        <span className="text-xs text-[#64748b]">
                          {candidate.employeeCode}
                          {candidate.employeeAssignments[0]?.department.name
                            ? ` · ${candidate.employeeAssignments[0].department.name}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <span className="text-xs text-[#64748b]">
                  Hệ thống chỉ tìm nhân sự đang hoạt động trong cùng phòng ban.
                </span>
              </div>
              <label className="grid gap-1 text-sm font-medium text-[#475569]">
                <span className="flex items-center gap-1.5">
                  Chứng từ/URL
                  {attachmentRequired ? (
                    <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      Bắt buộc
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-[#94a3b8]">
                      (không bắt buộc)
                    </span>
                  )}
                </span>
                <input
                  type="url"
                  value={form.attachmentUrl}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setForm((current) => ({ ...current, attachmentUrl: next }));
                  }}
                  aria-invalid={attachmentMissing}
                  aria-describedby={
                    attachmentMissing ? "leave-attachment-error" : undefined
                  }
                  placeholder={attachmentHint[form.leaveType]}
                  className={`h-10 rounded-lg border bg-white px-3 text-sm text-[#0f172a] outline-none ${
                    attachmentMissing
                      ? "border-rose-300 focus:border-rose-400"
                      : "border-[#d7dce3] focus:border-[#1976D2]"
                  }`}
                />
                {attachmentMissing ? (
                  <span
                    id="leave-attachment-error"
                    className="text-xs font-normal text-rose-700"
                  >
                    Nghỉ ốm từ {SICK_ATTACHMENT_MIN_DAYS} ngày phải có chứng từ
                    đính kèm.
                  </span>
                ) : null}
                {estimatedAnnualAllocation ? (
                  <div className="mt-1 text-xs">
                    Ước tính nguồn:{" "}
                    <span className="font-semibold text-[#1565C0]">
                      {formatDays(estimatedAnnualAllocation.paid)} P
                    </span>{" "}
                    ·{" "}
                    <span className="font-semibold text-amber-700">
                      {formatDays(estimatedAnnualAllocation.unpaid)} KL
                    </span>
                  </div>
                ) : null}
              </label>
              <div className="rounded-lg border border-[#d7dce3] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                Tạm tính:{" "}
                <span className="font-semibold text-[#0f172a]">
                  {formatDays(estimatedDays)} ngày
                </span>
                <div className="mt-0.5 text-xs text-[#64748b]">
                  Số ngày trừ phép chính thức do hệ thống tính theo lịch làm
                  việc của bạn (không tính cuối tuần, ngày lễ) và hiển thị sau
                  khi gửi đơn.
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-4 text-sm font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                disabled={
                  submitting || estimatedDays <= 0 || blockingIssues.length > 0
                }
                onClick={() => void handleCreate()}
              >
                <Send size={16} aria-hidden="true" />
                {submitting ? "Đang gửi" : "Gửi đơn"}
              </button>
            </div>
          </section>

          {canReviewOnChat && approvals !== null ? (
            <section className="rounded-lg border border-[#d7dce3] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#0f172a]">
                Duyệt nhanh
              </h2>
              <div className="mt-3 space-y-2">
                {approvals.items.length === 0 ? (
                  <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#64748b]">
                    Không có đơn chờ duyệt.
                  </div>
                ) : (
                  approvals.items.map((request) => (
                    <ApprovalRow
                      key={request.id}
                      request={request}
                      busy={busyId === request.id}
                      onApprove={(item) => void handleApproval(item, "approve")}
                      onReject={(item) => void handleApproval(item, "reject")}
                    />
                  ))
                )}
              </div>
              {approvals.pagination.totalPages > 1 ? (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#e2e8f0] pt-3 text-xs text-[#64748b]">
                  <span>
                    Trang {approvals.pagination.page}/
                    {approvals.pagination.totalPages} ·{" "}
                    {approvals.pagination.total} đơn
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-[#d7dce3] px-2 py-1 font-medium text-[#475569] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:text-[#94a3b8]"
                      disabled={
                        !approvals.pagination.hasPreviousPage || busyId !== null
                      }
                      onClick={() => {
                        const previousPage = approvals.pagination.page - 1;
                        setApprovalPage(previousPage);
                        void loadApprovals(previousPage);
                      }}
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[#d7dce3] px-2 py-1 font-medium text-[#475569] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:text-[#94a3b8]"
                      disabled={
                        !approvals.pagination.hasNextPage || busyId !== null
                      }
                      onClick={() => {
                        const nextPage = approvals.pagination.page + 1;
                        setApprovalPage(nextPage);
                        void loadApprovals(nextPage);
                      }}
                    >
                      Sau
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </section>
    </WorkPageShell>
  );
};

export default MyLeavePage;
