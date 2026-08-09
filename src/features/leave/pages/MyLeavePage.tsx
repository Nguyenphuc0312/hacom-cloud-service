import React from "react";
import toast from "react-hot-toast";
import {
  Ban,
  CalendarCheck2,
  Check,
  Loader2,
  RefreshCcw,
  Send,
  X,
} from "lucide-react";

import {
  hrApi,
  type LeaveBalance,
  type LeaveHalfDaySession,
  type LeaveRequest,
  type LeaveType,
  type MyLeaveResponse,
  type WorkflowStatus,
} from "../../api/hrApi";
import {
  calculateLeaveDays,
  type LeaveDayPortion,
} from "../utils/leaveDays";

type LoadState =
  | { status: "idle" | "loading"; data: MyLeaveResponse | null; error: null }
  | { status: "success"; data: MyLeaveResponse; error: null }
  | { status: "error"; data: MyLeaveResponse | null; error: string };

const now = new Date();
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
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "SUBMITTED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const currentApprovalStep = (request: LeaveRequest) =>
  request.status === "SUBMITTED"
    ? (request.approvalSteps?.find((step) => step.status === "SUBMITTED") ?? null)
    : null;

const toHalfDaySession = (portion: LeaveDayPortion): LeaveHalfDaySession => {
  if (portion === "AM") return "MORNING";
  if (portion === "PM") return "AFTERNOON";
  return "FULL_DAY";
};

const halfDaySessionLabel = (value?: LeaveHalfDaySession | null) => {
  if (value === "MORNING") return "Sang";
  if (value === "AFTERNOON") return "Chieu";
  return "Ca ngay";
};

const NoticeWarning: React.FC<{ request: LeaveRequest }> = ({ request }) => {
  if (!request.lateSubmission) return null;

  return (
    <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
      Gui muon: {request.noticeActualDays ?? "-"} / {request.noticeRequiredDays ?? "-"} ngay bao truoc
    </div>
  );
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDays = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : value.toLocaleString("vi-VN");

const extractErrorMessage = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  const normalizedMessage = Array.isArray(message) ? message.join(" ") : (message ?? "");
  if (normalizedMessage.includes("RETROACTIVE_LEAVE_LIMIT_EXCEEDED")) {
    return "Chỉ được khai lùi đơn nghỉ tối đa 3 ngày.";
  }
  if (normalizedMessage.includes("SICK_LEAVE_ATTACHMENT_REQUIRED")) {
    return "Nghỉ ốm từ 3 ngày cần có chứng từ đính kèm.";
  }
  if (status === 422) return "Tài khoản chưa liên kết hồ sơ nhân sự hoặc dữ liệu chưa hợp lệ.";
  if (status === 409) return "Trạng thái đơn nghỉ phép đã thay đổi.";
  return "Không tải được dữ liệu nghỉ phép lúc này.";
};

const BalanceCard: React.FC<{ balance: LeaveBalance }> = ({ balance }) => (
  <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-[#0f172a]">
          {leaveTypeLabel[balance.leaveType] ?? balance.label}
        </div>
        <div className="mt-1 text-xs text-[#64748b]">
          {balance.leaveType === "ANNUAL" ? "Từ ký hiệu P" : "Từ đơn đã duyệt"}
        </div>
      </div>
      <CalendarCheck2 size={18} className="text-[#1565C0]" aria-hidden="true" />
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
          {balance.remainingDays === null ? "Đối chiếu" : formatDays(balance.remainingDays)}
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
      <div className="font-medium text-[#0f172a]">{leaveTypeLabel[request.leaveType]}</div>
      <div className="text-xs text-[#64748b]">{formatDays(request.totalDays)} ngày</div>
    </td>
    <td className="min-w-[190px] px-4 py-3 text-sm text-[#475569]">
      {formatDate(request.startDate)} - {formatDate(request.endDate)}
      <div className="mt-1 text-xs text-[#64748b]">
        Buoi: {halfDaySessionLabel(request.startHalfDaySession)} - {halfDaySessionLabel(request.endHalfDaySession)}
      </div>
      <NoticeWarning request={request} />
    </td>
    <td className="min-w-[220px] px-4 py-3 text-sm text-[#475569]">
      {request.reason || "-"}
    </td>
    <td className="px-4 py-3">
      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
        {statusLabel[request.status]}
      </span>
      {currentApprovalStep(request) ? (
        <div className="mt-1 text-xs text-[#64748b]">
          Cap {currentApprovalStep(request)?.stepOrder}: {currentApprovalStep(request)?.stepName}
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
          {leaveTypeLabel[request.leaveType]} · {formatDays(request.totalDays)} ngày
        </div>
      </div>
      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
        {currentApprovalStep(request)
          ? `Cap ${currentApprovalStep(request)?.stepOrder}`
          : "Cho duyet"}
      </span>
    </div>
    <div className="mt-2 text-sm text-[#475569]">
      {formatDate(request.startDate)} - {formatDate(request.endDate)}
    </div>
    <div className="mt-1 text-xs text-[#64748b]">
      Buoi: {halfDaySessionLabel(request.startHalfDaySession)} - {halfDaySessionLabel(request.endHalfDaySession)}
    </div>
    <NoticeWarning request={request} />
    {request.reason ? (
      <div className="mt-1 line-clamp-2 text-sm text-[#64748b]">{request.reason}</div>
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

export const MyLeavePage: React.FC = () => {
  const [year, setYear] = React.useState(now.getFullYear());
  const [state, setState] = React.useState<LoadState>({
    status: "idle",
    data: null,
    error: null,
  });
  const [approvals, setApprovals] = React.useState<LeaveRequest[] | null>(null);
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
  });

  const totalDays = React.useMemo(
    () => calculateLeaveDays(form.startDate, form.endDate, form.startPortion, form.endPortion),
    [form.endDate, form.endPortion, form.startDate, form.startPortion],
  );

  const loadApprovals = React.useCallback(async () => {
    try {
      const pending = await hrApi.getPendingLeaveRequests();
      setApprovals(pending.data ?? []);
    } catch {
      setApprovals(null);
    }
  }, []);

  const loadLeave = React.useCallback(async () => {
    setState((current) => ({ status: "loading", data: current.data, error: null }));
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
    void loadApprovals();
  }, [loadApprovals, year]);

  React.useEffect(() => {
    void loadLeave();
  }, [loadLeave]);

  const data = state.data;
  const requests = data?.requests ?? [];
  const balances = data?.balances ?? [];

  async function handleCreate() {
    if (totalDays <= 0) {
      toast.error("Khoảng ngày nghỉ chưa hợp lệ.");
      return;
    }
    setSubmitting(true);
    try {
      await hrApi.createMyLeaveRequest({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        startHalfDaySession: toHalfDaySession(form.startPortion),
        endHalfDaySession: toHalfDaySession(form.endPortion),
        totalDays,
        reason: form.reason.trim() || undefined,
        attachmentUrl: form.attachmentUrl.trim() || undefined,
      });
      toast.success("Đã gửi đơn nghỉ phép.");
      setForm((current) => ({ ...current, reason: "", attachmentUrl: "" }));
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

  async function handleApproval(request: LeaveRequest, action: "approve" | "reject") {
    setBusyId(request.id);
    try {
      if (action === "approve") {
        await hrApi.approveLeaveRequest(request.id);
        toast.success("Đã duyệt đơn nghỉ phép.");
      } else {
        await hrApi.rejectLeaveRequest(request.id);
        toast.success("Đã từ chối đơn nghỉ phép.");
      }
      await Promise.all([loadLeave(), loadApprovals()]);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-full bg-[#eef2f7] text-[#0f172a]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b border-[#d7dce3] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-[#0f172a]">
              Nghỉ phép của tôi
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
              <span>Năm {year}</span>
              <span aria-hidden="true">·</span>
              <span>{data?.mode === "EMPLOYEE_NOT_LINKED" ? "Chưa liên kết HR" : "Quỹ phép đang đối chiếu"}</span>
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
                onChange={(event) => setYear(Number(event.currentTarget.value) || now.getFullYear())}
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
        </header>

        {state.status === "error" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {state.error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {balances.length > 0 ? (
                balances.map((balance) => (
                  <BalanceCard key={balance.leaveType} balance={balance} />
                ))
              ) : (
                <div className="rounded-lg border border-[#d7dce3] bg-white px-4 py-10 text-center text-sm text-[#64748b] sm:col-span-2 xl:col-span-4">
                  {data?.message ?? "Chưa có dữ liệu quỹ phép."}
                </div>
              )}
            </div>

            <section className="overflow-hidden rounded-lg border border-[#d7dce3] bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#0f172a]">Đơn nghỉ phép</h2>
                {state.status === "loading" ? (
                  <Loader2 size={16} className="animate-spin text-[#64748b]" aria-hidden="true" />
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
              <h2 className="text-sm font-semibold text-[#0f172a]">Gửi đơn nghỉ</h2>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Loại nghỉ</span>
                  <select
                    value={form.leaveType}
                    onChange={(event) => setForm((current) => ({ ...current, leaveType: event.currentTarget.value as LeaveType }))}
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
                  <label className="grid gap-1 text-sm font-medium text-[#475569]">
                    <span>Từ ngày</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        startDate: event.currentTarget.value,
                        endDate: current.endDate < event.currentTarget.value ? event.currentTarget.value : current.endDate,
                      }))}
                      className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[#475569]">
                    <span>Đến ngày</span>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(event) => setForm((current) => ({ ...current, endDate: event.currentTarget.value }))}
                      className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-sm font-medium text-[#475569]">
                    <span>Buổi đầu</span>
                    <select
                      value={form.startPortion}
                      onChange={(event) => setForm((current) => ({ ...current, startPortion: event.currentTarget.value as LeaveDayPortion }))}
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
                      onChange={(event) => setForm((current) => ({ ...current, endPortion: event.currentTarget.value as LeaveDayPortion }))}
                      className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                    >
                      <option value="FULL">Cả ngày</option>
                      <option value="AM">Sáng</option>
                      <option value="PM">Chiều</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Lý do</span>
                  <textarea
                    value={form.reason}
                    onChange={(event) => setForm((current) => ({ ...current, reason: event.currentTarget.value }))}
                    rows={4}
                    maxLength={1000}
                    className="resize-none rounded-lg border border-[#d7dce3] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#475569]">
                  <span>Chứng từ/URL</span>
                  <input
                    type="url"
                    value={form.attachmentUrl}
                    onChange={(event) => setForm((current) => ({ ...current, attachmentUrl: event.currentTarget.value }))}
                    placeholder="Bắt buộc với nghỉ ốm từ 3 ngày"
                    className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
                  />
                </label>
                <div className="rounded-lg border border-[#d7dce3] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                  Tổng: <span className="font-semibold text-[#0f172a]">{formatDays(totalDays)} ngày</span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1565C0] px-4 text-sm font-semibold text-white hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#94a3b8]"
                  disabled={submitting || totalDays <= 0}
                  onClick={() => void handleCreate()}
                >
                  <Send size={16} aria-hidden="true" />
                  {submitting ? "Đang gửi" : "Gửi đơn"}
                </button>
              </div>
            </section>

            {approvals !== null ? (
              <section className="rounded-lg border border-[#d7dce3] bg-white p-4">
                <h2 className="text-sm font-semibold text-[#0f172a]">Duyệt nhanh</h2>
                <div className="mt-3 space-y-2">
                  {approvals.length === 0 ? (
                    <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#64748b]">
                      Không có đơn chờ duyệt.
                    </div>
                  ) : (
                    approvals.map((request) => (
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
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
};

export default MyLeavePage;
