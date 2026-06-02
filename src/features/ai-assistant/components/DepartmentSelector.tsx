import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  BarChart2Icon,
  XIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BuildingIcon,
  Loader2Icon,
} from "lucide-react";
import clsx from "clsx";
import type { DepartmentSelectionRequest, WorkReportRecord } from "../types";
import { fetchWorkReports, fetchDepartments } from "../services/aiChatApi";
import type { DepartmentListItem } from "../services/aiChatApi";
import { WorkReportTable } from "./WorkReportTable";

interface DepartmentSelectorProps {
  data: DepartmentSelectionRequest;
  onCancel: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={clsx(
      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
      checked
        ? "border-[#1565C0] bg-gradient-to-br from-[#1565C0] to-[#1976D2]"
        : "border-border",
    )}
  >
    {checked && (
      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
        <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

const ReportModal: React.FC<{
  reports: WorkReportRecord[];
  departments: string[];
  startDate: string;
  endDate: string;
  onClose: () => void;
}> = ({ reports, departments, startDate, endDate, onClose }) =>
  createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#1976D2]/8 shrink-0">
          <span className="text-sm font-semibold text-[#1565C0]">Kết quả báo cáo công việc</span>
          <button type="button" onClick={onClose} title="Đóng"
            className="flex items-center justify-center h-7 w-7 rounded-lg text-text-muted hover:bg-surface-hover transition-colors">
            <XIcon size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <WorkReportTable reports={reports} departments={departments} startDate={startDate} endDate={endDate} />
        </div>
      </div>
    </div>,
    document.body,
  );

export const DepartmentSelector: React.FC<DepartmentSelectorProps> = ({ data, onCancel }) => {
  // Data từ API departments (đầy đủ hơn SSE options)
  const [deptList, setDeptList] = useState<DepartmentListItem[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Step state
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(firstDayOfMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<WorkReportRecord[] | null>(null);

  // Fetch danh sách phòng ban đầy đủ từ API
  useEffect(() => {
    let cancelled = false;
    setLoadingDepts(true);
    fetchDepartments()
      .then((res) => {
        if (!cancelled) {
          setDeptList(res.departments ?? []);
          setFetchError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback về SSE options nếu API fail
          setDeptList(
            data.options
              .filter((o) => o.type === "department")
              .map((o) => ({ department: o.value, company: o.company ?? "", count: o.count })),
          );
          setFetchError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDepts(false);
      });
    return () => { cancelled = true; };
  }, [data.options]);

  // Danh sách công ty unique từ dept list
  const companies = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const d of deptList) {
      if (d.company && !seen.has(d.company)) {
        seen.add(d.company);
        result.push(d.company);
      }
    }
    return result;
  }, [deptList]);

  // Đếm số báo cáo theo công ty
  const countByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deptList) {
      if (d.company) {
        map.set(d.company, (map.get(d.company) ?? 0) + d.count);
      }
    }
    return map;
  }, [deptList]);

  // Phòng ban theo công ty đã chọn
  const deptsForCompany = useMemo(
    () => deptList.filter((d) => d.company === selectedCompany),
    [deptList, selectedCompany],
  );

  const toggleDept = (dept: string) => {
    setError(null);
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept],
    );
  };

  const handleSelectCompany = (company: string) => {
    setSelectedCompany(company);
    setSelectedDepts([]);
    setError(null);
  };

  const handleBack = () => {
    setSelectedCompany(null);
    setSelectedDepts([]);
    setError(null);
  };

  const handleFetch = async () => {
    if (selectedDepts.length === 0) {
      setError("Vui lòng chọn ít nhất một phòng ban");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const results = await Promise.all(
        selectedDepts.map((dept) =>
          fetchWorkReports({ department: dept, start: startDate, end: endDate }),
        ),
      );
      const all: WorkReportRecord[] = [];
      for (const res of results) {
        if (res.reports) all.push(...res.reports);
      }
      all.sort((a, b) =>
        a.date.localeCompare(b.date) || a.user_name.localeCompare(b.user_name),
      );
      setReports(all);
    } catch {
      setError("Không thể tải báo cáo, vui lòng thử lại");
    } finally {
      setIsLoading(false);
    }
  };

  // Loading skeleton
  if (loadingDepts) {
    return (
      <div className="w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-[#1976D2]/8 border-b border-border">
          <h3 className="text-sm font-semibold text-[#1565C0]">Xem báo cáo công việc</h3>
        </div>
        <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
          <Loader2Icon size={16} className="animate-spin" />
          Đang tải danh sách phòng ban...
        </div>
      </div>
    );
  }

  if (deptList.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-sm px-4 py-6 text-sm text-text-muted text-center">
        Chưa có báo cáo nào trong hệ thống
      </div>
    );
  }

  const step: "company" | "department" = selectedCompany ? "department" : "company";

  return (
    <>
      {reports !== null && (
        <ReportModal
          reports={reports}
          departments={selectedDepts}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setReports(null)}
        />
      )}

      <div className="w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-[#1976D2]/8 border-b border-border">
          <div className="flex items-center gap-2">
            {step === "department" && (
              <button type="button" onClick={handleBack}
                className="flex items-center justify-center h-6 w-6 rounded-md text-[#1565C0] hover:bg-[#1976D2]/15 transition-colors"
                title="Quay lại">
                <ChevronLeftIcon size={15} />
              </button>
            )}
            <h3 className="text-sm font-semibold text-[#1565C0] flex items-center gap-1.5">
              {step === "department" ? (
                <>
                  <span className="text-text-muted font-normal text-xs">{selectedCompany}</span>
                  <ChevronRightIcon size={12} className="text-text-muted" />
                  Chọn phòng ban
                </>
              ) : (
                "Xem báo cáo công việc"
              )}
            </h3>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-col gap-3">

          {/* BƯỚC 1 — chọn công ty */}
          {step === "company" && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">
                Chọn công ty/đơn vị để xem báo cáo:
              </p>
              <div className="flex flex-col gap-1.5">
                {companies.map((company) => (
                  <button
                    key={company}
                    type="button"
                    onClick={() => handleSelectCompany(company)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:bg-[#1976D2]/8 hover:border-[#1976D2]/25 transition-colors text-left group"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1976D2]/10 text-[#1565C0] group-hover:bg-[#1976D2]/18 transition-colors">
                      <BuildingIcon size={15} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-text-primary truncate">{company}</span>
                      <span className="block text-xs text-text-muted">
                        {deptsForCompany.length > 0
                          ? `${deptList.filter((d) => d.company === company).length} phòng ban · ${countByCompany.get(company) ?? 0} báo cáo`
                          : `${countByCompany.get(company) ?? 0} báo cáo`}
                      </span>
                    </span>
                    <ChevronRightIcon size={15} className="text-text-muted group-hover:text-[#1565C0] shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BƯỚC 2 — chọn phòng ban */}
          {step === "department" && (
            <>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">
                  Chọn phòng ban (có thể chọn nhiều):
                </p>
                <div className="flex flex-col gap-1.5">
                  {deptsForCompany.map((d) => {
                    const checked = selectedDepts.includes(d.department);
                    return (
                      <label
                        key={d.department}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                          checked
                            ? "bg-[#1976D2]/8 border border-[#1976D2]/30"
                            : "border border-transparent hover:bg-surface-hover",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDept(d.department)}
                          className="sr-only"
                        />
                        <Checkbox checked={checked} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-text-primary truncate">{d.department}</span>
                        </span>
                        <span className="text-xs text-text-muted shrink-0">({d.count} báo cáo)</span>
                      </label>
                    );
                  })}
                  {deptsForCompany.length === 0 && (
                    <p className="text-xs text-text-muted py-2 px-1">
                      Không có phòng ban nào trong đơn vị này
                    </p>
                  )}
                </div>
              </div>

              {/* Date range */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-secondary whitespace-nowrap">Từ ngày:</label>
                  <input type="date" value={startDate} max={endDate} title="Từ ngày"
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-secondary whitespace-nowrap">Đến ngày:</label>
                  <input type="date" value={endDate} min={startDate} max={todayStr()} title="Đến ngày"
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25" />
                </div>
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}
              {fetchError && <p className="text-xs text-text-muted">{fetchError}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-overlay/20">
          <button type="button" onClick={onCancel} disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50">
            <XIcon size={14} />
            Hủy
          </button>
          {step === "department" && (
            <button type="button" onClick={handleFetch}
              disabled={isLoading || selectedDepts.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#1976D2] to-[#1565C0] hover:brightness-105 transition-all disabled:opacity-50 shadow-sm">
              <BarChart2Icon size={14} />
              {isLoading ? "Đang tải..." : "Xem báo cáo"}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
