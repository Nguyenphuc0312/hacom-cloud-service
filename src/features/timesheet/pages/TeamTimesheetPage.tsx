import React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCcw,
  UserRoundCheck,
} from "lucide-react";
import {
  hrApi,
  type TeamTimesheetConfirmation,
  type TeamTimesheetResponse,
  type TimesheetConfirmationStatus,
  type TimesheetPeriodStatus,
} from "../../api/hrApi";
import { ROUTE_PATHS } from "../../../router/paths";

type LoadState =
  | { status: "idle" | "loading"; data: TeamTimesheetResponse | null; error: null }
  | { status: "success"; data: TeamTimesheetResponse; error: null }
  | { status: "error"; data: TeamTimesheetResponse | null; error: string };

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
  DISPUTED: "Khiếu nại",
};

const toInputMonth = (month: number, year: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

const fromInputMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return {
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    year: Number.isFinite(year) && year >= 2020 && year <= 2100 ? year : now.getFullYear(),
  };
};

const extractErrorMessage = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) {
    return "Bạn chưa có quyền xem bảng công nhóm hoặc phiên HRM chưa sẵn sàng.";
  }
  return "Không tải được dữ liệu nhóm lúc này. Chat vẫn hoạt động bình thường.";
};

const statusClass = (status: TimesheetConfirmationStatus) => {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DISPUTED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const SummaryTile: React.FC<{
  label: string;
  value: number;
  tone?: string;
}> = ({ label, value, tone = "text-[#1565C0]" }) => (
  <div className="rounded-lg border border-[#d7dce3] bg-white p-4">
    <div className="text-sm text-[#64748b]">{label}</div>
    <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
  </div>
);

const EmployeeRow: React.FC<{ row: TeamTimesheetConfirmation }> = ({ row }) => (
  <tr className="border-b border-[#e2e8f0] last:border-0">
    <td className="min-w-[180px] px-4 py-3">
      <div className="font-medium text-[#0f172a]">{row.fullName}</div>
      <div className="text-xs text-[#64748b]">{row.employeeCode}</div>
    </td>
    <td className="min-w-[220px] px-4 py-3 text-sm text-[#475569]">
      <div>{row.departmentName ?? "-"}</div>
      <div className="text-xs text-[#64748b]">{row.unitName ?? "-"}</div>
    </td>
    <td className="px-4 py-3">
      <span
        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}
      >
        {confirmationStatusLabel[row.status]}
      </span>
    </td>
    <td className="px-4 py-3 text-sm text-[#475569]">{formatDateTime(row.confirmedAt)}</td>
    <td className="px-4 py-3 text-sm text-[#475569]">
      {row.snapshot.totalPaidDays ?? "-"}
    </td>
    <td className="min-w-[240px] px-4 py-3 text-sm text-[#475569]">
      {row.disputeNote ? (
        <span title={row.disputeNote}>{row.disputeNote}</span>
      ) : (
        "-"
      )}
    </td>
  </tr>
);

export const TeamTimesheetPage: React.FC = () => {
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [state, setState] = React.useState<LoadState>({
    status: "idle",
    data: null,
    error: null,
  });

  const loadTeamTimesheet = React.useCallback(async () => {
    setState((current) => ({ status: "loading", data: current.data, error: null }));
    try {
      const data = await hrApi.getTeamTimesheet({ month, year });
      setState({ status: "success", data, error: null });
    } catch (error) {
      setState((current) => ({
        status: "error",
        data: current.data,
        error: extractErrorMessage(error),
      }));
    }
  }, [month, year]);

  React.useEffect(() => {
    void loadTeamTimesheet();
  }, [loadTeamTimesheet]);

  const data = state.data;
  const period = data?.period ?? null;
  const confirmations = data?.confirmations ?? [];
  const summary = data?.summary ?? {
    total: 0,
    pending: 0,
    confirmed: 0,
    disputed: 0,
  };

  return (
    <main className="min-h-full bg-[#eef2f7] text-[#0f172a]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b border-[#d7dce3] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-[#0f172a]">
              Nhóm của tôi
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
              <span>Tháng {month}/{year}</span>
              {period ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{periodStatusLabel[period.status]}</span>
                  <span aria-hidden="true">·</span>
                  <span>Hạn {period.confirmDeadline ?? "-"}</span>
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
            <label className="grid gap-1 text-xs font-medium text-[#475569]">
              <span>Tháng</span>
              <input
                type="month"
                value={toInputMonth(month, year)}
                onChange={(event) => {
                  const next = fromInputMonth(event.currentTarget.value);
                  setMonth(next.month);
                  setYear(next.year);
                }}
                className="h-10 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
              />
            </label>
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
              onClick={() => void loadTeamTimesheet()}
              disabled={state.status === "loading"}
            >
              <RefreshCcw size={16} aria-hidden="true" />
              Tải lại
            </button>
            <Link
              to={ROUTE_PATHS.TIMESHEET}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1565C0] px-3 text-sm font-semibold text-white hover:bg-[#1976D2]"
            >
              <UserRoundCheck size={16} aria-hidden="true" />
              Công của tôi
            </Link>
          </div>
        </header>

        {state.status === "error" ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} aria-hidden="true" />
            {state.error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Tổng nhân viên" value={summary.total} />
          <SummaryTile label="Đã xác nhận" value={summary.confirmed} tone="text-emerald-700" />
          <SummaryTile label="Chưa xác nhận" value={summary.pending} tone="text-slate-700" />
          <SummaryTile label="Khiếu nại" value={summary.disputed} tone="text-amber-700" />
        </section>

        <section className="overflow-hidden rounded-lg border border-[#d7dce3] bg-white">
          {!period ? (
            <div className="px-4 py-12 text-center">
              <Clock3 size={28} className="mx-auto text-[#64748b]" aria-hidden="true" />
              <p className="mt-3 font-medium text-[#334155]">
                {data?.message ?? "Chưa có kỳ công mở cho nhóm trong tháng này."}
              </p>
            </div>
          ) : state.status === "loading" && confirmations.length === 0 ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-[#f1f5f9]" />
              ))}
            </div>
          ) : confirmations.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <CheckCircle2 size={28} className="mx-auto text-[#64748b]" aria-hidden="true" />
              <p className="mt-3 font-medium text-[#334155]">
                Không có nhân viên nào trong phạm vi được xem.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nhân viên</th>
                    <th className="px-4 py-3 font-semibold">Bộ phận</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 font-semibold">Xác nhận lúc</th>
                    <th className="px-4 py-3 font-semibold">Công</th>
                    <th className="px-4 py-3 font-semibold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmations.map((row) => (
                    <EmployeeRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default TeamTimesheetPage;
