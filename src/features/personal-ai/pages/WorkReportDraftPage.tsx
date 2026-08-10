import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangleIcon, CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import {
  describeScope,
  fetchWorkReportScopes,
  ScopeFeatureDisabledError,
} from "../api/workReportScopeApi";
import {
  approveWorkReportDraft,
  createWorkReportDraftJob,
  describeDraftError,
  fetchDraftPreflight,
  validateDraftPeriod,
} from "../api/workReportDraftApi";
import type { DraftPreflight } from "../api/workReportDraftApi";
import { downloadWorkReportDraft, workReportDraftExportUrlFromId } from "../api/personalAiApi";
import { pollWorkReportDraftJob } from "../services/workReportDraftPoller";
import type { DraftPollHandle } from "../services/workReportDraftPoller";
import type { WorkReportScope } from "../types";
import { toast } from "../../../utils/toast";
import { Button } from "../../../components/ui";
import { DateFieldVN, useIsoDateField } from "../../../components/ui/DateFieldVN";

/** Ngày hôm nay dạng YYYY-MM-DD theo giờ máy (input[type=date] dùng dạng này). */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type DraftStage =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "polling"; jobId: string }
  | { kind: "timeout"; jobId: string }
  | { kind: "ready"; draftId: string }
  | { kind: "failed"; message: string };

/**
 * Màn hình bản nháp giao ban (contract mục 2–6).
 *
 * Luồng: chọn phạm vi DEPARTMENT → chọn kỳ 1–31 ngày → preflight → tạo job →
 * poll → tải Excel / duyệt.
 *
 * CHƯA có phần xem–hiệu đính từng mục (contract mục 5): contract chỉ liệt kê
 * đường dẫn `/items`, `/items/{id}/sources`, `/tbp-form` mà không mô tả response
 * shape. Đoán shape thì màn hiệu đính render rỗng mà không báo lỗi, nên đang chờ
 * `FE__work-report-draft-items-shape__contract__07-08-26.md`.
 */
export const WorkReportDraftPage: React.FC = () => {
  // ── Phạm vi (contract mục 1) ──────────────────────────────────────────────
  const [scopes, setScopes] = useState<WorkReportScope[] | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string>("");

  // ── Kỳ báo cáo (contract mục 2) ───────────────────────────────────────────
  const [periodStart, setPeriodStart] = useState(daysAgoIso(6));
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const [preflight, setPreflight] = useState<DraftPreflight | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const [stage, setStage] = useState<DraftStage>({ kind: "idle" });
  const [isApproving, setIsApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const pollerRef = useRef<DraftPollHandle | null>(null);

  // Rời trang giữa lúc đang poll → huỷ, tránh timer chạy tiếp sau unmount.
  useEffect(() => () => pollerRef.current?.cancel(), []);

  const selectedScope = useMemo(
    () => scopes?.find((s) => s.authorizationId === selectedScopeId) ?? null,
    [scopes, selectedScopeId],
  );
  const scopeToken = selectedScope?.selectionToken || undefined;

  // Contract mục 1: chỉ hiện action sau khi lấy scope `department_read`.
  useEffect(() => {
    const ac = new AbortController();
    fetchWorkReportScopes({ capability: "department_read", signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        // Contract chỉ cho tạo bản nháp trên phạm vi DEPARTMENT.
        const departments = res.scopes.filter((s) => s.scopeType === "DEPARTMENT");
        setScopes(departments);
        if (departments.length === 1) setSelectedScopeId(departments[0].authorizationId);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setScopes([]);
        setScopeError(
          err instanceof ScopeFeatureDisabledError
            ? "Tính năng phạm vi báo cáo đang tắt. Liên hệ quản trị để bật thí điểm."
            : "Không tải được danh sách phạm vi. Vui lòng thử lại.",
        );
      });
    return () => ac.abort();
  }, []);

  const periodCheck = validateDraftPeriod(periodStart, periodEnd);

  /** Đổi phạm vi/kỳ → kết quả preflight cũ không còn đúng, bỏ đi. */
  const resetDownstream = useCallback(() => {
    pollerRef.current?.cancel();
    pollerRef.current = null;
    setPreflight(null);
    setPreflightError(null);
    setStage({ kind: "idle" });
    setIsApproved(false);
  }, []);

  // State vẫn giữ ISO; ô nhập hiển thị dd/mm/yyyy cứng, không theo locale máy.
  const periodStartField = useIsoDateField(periodStart, (iso) => {
    setPeriodStart(iso);
    resetDownstream();
  });
  const periodEndField = useIsoDateField(periodEnd, (iso) => {
    setPeriodEnd(iso);
    resetDownstream();
  });

  const handlePreflight = useCallback(async () => {
    if (!periodCheck.ok) return;
    setIsPreflighting(true);
    setPreflightError(null);
    setPreflight(null);
    setStage({ kind: "idle" });
    try {
      const result = await fetchDraftPreflight({ periodStart, periodEnd, scopeToken });
      setPreflight(result);
    } catch (err) {
      setPreflightError(describeDraftError(err));
    } finally {
      setIsPreflighting(false);
    }
  }, [periodCheck.ok, periodStart, periodEnd, scopeToken]);

  /** Bắt đầu poll một job — dùng chung cho lúc tạo mới và nút "Kiểm tra lại". */
  const startPolling = useCallback((jobId: string) => {
    setStage({ kind: "polling", jobId });
    pollerRef.current?.cancel();
    pollerRef.current = pollWorkReportDraftJob(jobId, {
      onReady: (draft) => {
        pollerRef.current = null;
        setStage({ kind: "ready", draftId: draft.draft_id });
      },
      onFailed: (message) => {
        pollerRef.current = null;
        // Contract mục 4: `failed` hiện như lỗi vận hành, KHÔNG tự tạo lại job.
        setStage({ kind: "failed", message: message || "Job dựng bản nháp thất bại." });
      },
      onTimeout: () => {
        pollerRef.current = null;
        setStage({ kind: "timeout", jobId });
      },
    });
  }, []);

  const handleCreate = useCallback(async () => {
    setStage({ kind: "creating" });
    try {
      const job = await createWorkReportDraftJob({ periodStart, periodEnd, scopeToken });
      if (!job.job_id) {
        setStage({ kind: "failed", message: "Máy chủ không trả về mã job." });
        return;
      }
      // `reused=true` là bình thường (BE dùng lại job/bản nháp cùng phạm vi+kỳ),
      // không phải lỗi — chỉ nói cho người dùng biết vì sao có kết quả ngay.
      if (job.reused) toast.info("Đang dùng lại bản nháp đã tạo cho kỳ này.");
      startPolling(job.job_id);
    } catch (err) {
      setStage({ kind: "failed", message: describeDraftError(err) });
    }
  }, [periodStart, periodEnd, scopeToken, startPolling]);

  const handleDownload = useCallback(async () => {
    if (stage.kind !== "ready") return;
    const url = workReportDraftExportUrlFromId(stage.draftId);
    if (!url) {
      toast.error("Mã bản nháp không hợp lệ, không dựng được liên kết tải.");
      return;
    }
    setIsDownloading(true);
    try {
      await downloadWorkReportDraft(url);
      toast.success("Đã tải bản nháp AI.");
    } catch (err) {
      toast.error(describeDraftError(err));
    } finally {
      setIsDownloading(false);
    }
  }, [stage]);

  const handleApprove = useCallback(async () => {
    if (stage.kind !== "ready") return;
    setIsApproving(true);
    try {
      await approveWorkReportDraft(stage.draftId, scopeToken);
      setIsApproved(true);
      toast.success("Đã duyệt bản nháp.");
    } catch (err) {
      // 409 stale → phải tạo lại draft, không cho dùng lại bản cũ (contract mục 6).
      toast.error(describeDraftError(err));
    } finally {
      setIsApproving(false);
    }
  }, [stage, scopeToken]);

  // Contract mục 6: nút Duyệt chỉ hiện với người có `department_submit`.
  const canApprove = selectedScope?.actions.includes("SUBMIT") ?? false;

  const isBusy =
    stage.kind === "creating" || stage.kind === "polling" || isPreflighting;

  return (
    <div className="h-full w-full overflow-y-auto bg-surface px-4 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[820px]">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary">
            Bản nháp AI báo cáo giao ban
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Bản nháp do AI tổng hợp, <strong>chỉ để đọc tham khảo</strong>. Không dùng
            file này để nộp báo cáo chính thức.
          </p>
        </header>

        {/* ── 1. Phạm vi ─────────────────────────────────────────────────── */}
        <section className="mb-5 rounded-xl border border-border bg-surface-hover/40 p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">1. Phạm vi</h2>

          {scopes === null ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2Icon size={14} className="animate-spin" />
              Đang tải danh sách phạm vi…
            </div>
          ) : scopeError ? (
            <p className="text-sm text-red-600">{scopeError}</p>
          ) : scopes.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Bạn không có phạm vi bộ phận nào để tạo bản nháp giao ban.
            </p>
          ) : (
            <select
              value={selectedScopeId}
              onChange={(e) => {
                setSelectedScopeId(e.target.value);
                resetDownstream();
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/25"
            >
              <option value="">— Chọn bộ phận —</option>
              {scopes.map((s) => (
                <option key={s.authorizationId} value={s.authorizationId}>
                  {describeScope(s)}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* ── 2. Kỳ báo cáo ──────────────────────────────────────────────── */}
        <section className="mb-5 rounded-xl border border-border bg-surface-hover/40 p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">
            2. Kỳ báo cáo <span className="font-normal text-text-muted">(tối đa 31 ngày)</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <DateFieldVN
              {...periodStartField}
              ariaLabel="Từ ngày"
              wrapClassName="rounded-lg border border-border bg-surface pr-1 focus-within:border-[#1976D2]/60"
              className="w-[110px] bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
            />
            <span className="text-text-muted">→</span>
            <DateFieldVN
              {...periodEndField}
              ariaLabel="Đến ngày"
              wrapClassName="rounded-lg border border-border bg-surface pr-1 focus-within:border-[#1976D2]/60"
              className="w-[110px] bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
            />
            <Button
              type="button"
              variant="brand-outline"
              onClick={() => void handlePreflight()}
              disabled={!periodCheck.ok || isBusy || (scopes?.length ?? 0) === 0}
            >
              {isPreflighting ? "Đang kiểm tra…" : "Kiểm tra dữ liệu"}
            </Button>
          </div>
          {!periodCheck.ok && (
            <p className="mt-2 text-xs text-red-600">{periodCheck.reason}</p>
          )}
        </section>

        {/* ── 3. Kết quả preflight ───────────────────────────────────────── */}
        {preflightError && (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {preflightError}
          </p>
        )}

        {preflight && (
          <section className="mb-5 rounded-xl border border-border bg-surface-hover/40 p-4">
            <h2 className="mb-2 text-sm font-semibold text-text-primary">3. Dữ liệu nguồn</h2>

            <p className="text-sm text-text-secondary">
              Tìm thấy <strong>{preflight.source_task_count}</strong> công việc trong kỳ
              thuộc phạm vi đã chọn.
            </p>

            {!preflight.ready && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" />
                <span>{preflight.reason || "Chưa đủ điều kiện tạo bản nháp."}</span>
              </p>
            )}

            {/* Cảnh báo quản trị: dữ liệu hỏng ở phòng KHÁC không khoá nút tạo
                (contract mục 2), chỉ liệt kê để backfill đúng chỗ. */}
            {preflight.unattributed_task_count_outside_scope > 0 && (
              <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <summary className="cursor-pointer text-xs font-medium text-amber-800">
                  {preflight.unattributed_task_count_outside_scope} công việc ở phạm vi khác
                  chưa gán đơn vị/bộ phận (không ảnh hưởng bản nháp này)
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {preflight.unattributed_scopes.map((s, i) => (
                    <li key={`${s.company}-${s.department}-${i}`}>
                      {s.company || "(không rõ công ty)"} ·{" "}
                      {s.department || "(không rõ bộ phận)"} — {s.task_count} công việc
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-3">
              <Button
                type="button"
                variant="brand"
                onClick={() => void handleCreate()}
                disabled={!preflight.ready || isBusy}
              >
                {stage.kind === "creating" ? "Đang tạo…" : "Tạo bản nháp"}
              </Button>
            </div>
          </section>
        )}

        {/* ── 4. Trạng thái job + kết quả ────────────────────────────────── */}
        {stage.kind === "polling" && (
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-hover/40 p-4 text-sm text-text-secondary">
            <Loader2Icon size={14} className="animate-spin" />
            Đang tạo bản nháp… (có thể mất vài phút)
          </p>
        )}

        {stage.kind === "timeout" && (
          <div className="rounded-xl border border-border bg-surface-hover/40 p-4">
            <p className="mb-2 text-sm text-text-secondary">
              Bản nháp vẫn đang được tạo. Bấm để kiểm tra lại — không cần tạo lại từ đầu.
            </p>
            <Button
              type="button"
              variant="brand-outline"
              onClick={() => startPolling(stage.jobId)}
            >
              Kiểm tra lại
            </Button>
          </div>
        )}

        {stage.kind === "failed" && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {stage.message}
          </p>
        )}

        {stage.kind === "ready" && (
          <section className="rounded-xl border border-border bg-surface-hover/40 p-4">
            <h2 className="mb-1 text-sm font-semibold text-text-primary">
              4. Bản nháp đã sẵn sàng
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              File gồm 4 sheet: Bao cao giao ban · Phu luc cong viec · Nguon chi tiet ·
              Huong dan.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="brand-outline"
                onClick={() => void handleDownload()}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2Icon size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <DownloadIcon size={13} className="mr-1.5" />
                )}
                Tải bản nháp AI (chỉ để đọc tham khảo)
              </Button>

              {canApprove &&
                (isApproved ? (
                  <span className="inline-flex items-center gap-1 text-sm text-green-700">
                    <CheckIcon size={14} /> Đã duyệt
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="brand"
                    onClick={() => void handleApprove()}
                    disabled={isApproving}
                  >
                    {isApproving ? "Đang duyệt…" : "Duyệt bản nháp"}
                  </Button>
                ))}
            </div>

            {/* Contract mục 5 (xem + hiệu đính từng mục) chưa dựng — thiếu shape
                response. Nói thẳng để người dùng không tưởng là mất tính năng. */}
            <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
              Phần xem và hiệu đính từng mục đang được bổ sung. Hiện tại xem nội dung
              chi tiết bằng cách tải file Excel ở trên.
            </p>
          </section>
        )}
      </div>
    </div>
  );
};

export default WorkReportDraftPage;
