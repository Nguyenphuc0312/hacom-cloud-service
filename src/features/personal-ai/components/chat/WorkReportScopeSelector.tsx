import React, { useEffect, useState } from "react";
import { BuildingIcon, Loader2Icon, XIcon } from "lucide-react";
import clsx from "clsx";
import type { WorkReportScope } from "../../types";
import {
  describeScope,
  fetchWorkReportScopes,
  ScopeFeatureDisabledError,
  ScopeFetchError,
} from "../../api/workReportScopeApi";
import { useWorkReportScopeStore } from "../../stores/workReportScopeStore";

interface WorkReportScopeSelectorProps {
  /** Gửi lại câu hỏi đang hoãn sau khi user chọn scope (§3). */
  onSelected?: (scope: WorkReportScope) => void;
  onCancel?: () => void;
}

function describeScopeError(err: unknown): string {
  if (err instanceof ScopeFetchError) {
    if (err.status === 401) return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.";
    // 503: HRM/Auth chưa xác nhận được quyền → cho retry, KHÔNG fallback scope cũ (§5).
    if (err.status === 503)
      return "Hệ thống chưa xác nhận được phạm vi báo cáo. Vui lòng thử lại.";
    return err.message;
  }
  return "Không tải được danh sách phạm vi, vui lòng thử lại.";
}

/**
 * Widget bắt buộc chọn một authorization trước khi đọc dữ liệu ngoài báo cáo
 * cá nhân (spec §3). Nhãn dựng từ dữ liệu response qua `describeScope`.
 */
export const WorkReportScopeSelector: React.FC<WorkReportScopeSelectorProps> = ({
  onSelected,
  onCancel,
}) => {
  const scopes = useWorkReportScopeStore((s) => s.scopes);
  const selected = useWorkReportScopeStore((s) => s.selected);
  const capability = useWorkReportScopeStore((s) => s.capability);
  const setScopes = useWorkReportScopeStore((s) => s.setScopes);
  const select = useWorkReportScopeStore((s) => s.select);
  const cancelPick = useWorkReportScopeStore((s) => s.cancelPick);

  const [isLoading, setIsLoading] = useState(scopes === null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // SSE `work_report_scope_required` đã nạp sẵn scopes → không gọi lại API.
  // Khi tự nạp (403 xóa scopes / mở trực tiếp) phải kèm `capability` để BE trả
  // đúng danh sách của thao tác đó, không phải scope của capability khác (§3).
  useEffect(() => {
    if (scopes !== null) {
      setIsLoading(false);
      return;
    }
    const ac = new AbortController();
    setIsLoading(true);
    fetchWorkReportScopes({ capability: capability ?? undefined, signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        setScopes(res.scopes, res.capability);
        setError(null);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        // Flag tắt → đóng widget, trả về luồng cũ (§2).
        if (err instanceof ScopeFeatureDisabledError) {
          cancelPick();
          return;
        }
        setError(describeScopeError(err));
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoading(false);
      });
    return () => ac.abort();
  }, [scopes, capability, reloadKey, setScopes, cancelPick]);

  const handleSelect = (scope: WorkReportScope) => {
    select(scope);
    onSelected?.(scope);
  };

  const handleCancel = () => {
    cancelPick();
    onCancel?.();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BuildingIcon className="h-4 w-4 text-[#1565C0]" />
          Chọn phạm vi báo cáo
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Hủy chọn phạm vi"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Bạn được cấp nhiều phạm vi. Chọn một phạm vi để xem hoặc nộp báo cáo.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Đang tải danh sách phạm vi…
        </div>
      )}

      {!isLoading && error && (
        <div className="py-2">
          <p className="mb-2 text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Thử lại
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Phạm vi báo cáo">
          {(scopes ?? []).map((scope) => {
            const isActive = selected?.authorizationId === scope.authorizationId;
            return (
              <li key={scope.authorizationId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => handleSelect(scope)}
                  className={clsx(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "border-[#1565C0] bg-[#1565C0]/5"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {describeScope(scope)}
                </button>
              </li>
            );
          })}
          {(scopes ?? []).length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              Bạn chưa được cấp phạm vi báo cáo nào.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
