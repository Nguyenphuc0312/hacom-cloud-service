import React from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

import { hrApi, type LeavePolicyCatalogItem } from "../../api/hrApi";
import { Button, Modal } from "../../../components/ui";
import {
  timesheetSymbolClass,
  timesheetSymbolLookupCode,
} from "../timesheetSymbolPresentation";

const SYSTEM_SYMBOLS: LeavePolicyCatalogItem[] = [
  {
    id: "system-holiday",
    code: "HOLIDAY",
    name: "Nghỉ lễ, Tết",
    displaySymbol: "L",
    deductsAnnualLeave: false,
    paid: true,
    dayValue: 1,
    requiresAttachment: false,
    quotaMode: "NONE",
    maxDaysPerEvent: null,
    hrRuleStatus: "CONFIRMED",
    note: "Ngày nghỉ lễ theo lịch công ty.",
    status: "ACTIVE",
  },
  {
    id: "system-holiday-half",
    code: "HOLIDAY_HALF",
    name: "Nghỉ lễ, Tết nửa ngày",
    displaySymbol: "L2",
    deductsAnnualLeave: false,
    paid: true,
    dayValue: 0.5,
    requiresAttachment: false,
    quotaMode: "NONE",
    maxDaysPerEvent: null,
    hrRuleStatus: "CONFIRMED",
    note: "Nửa ngày nghỉ lễ theo lịch công ty.",
    status: "ACTIVE",
  },
  {
    id: "system-weekly-off",
    code: "WEEKLY_OFF",
    name: "Nghỉ theo ca tuần",
    displaySymbol: "OFF",
    deductsAnnualLeave: false,
    paid: null,
    dayValue: 0,
    requiresAttachment: false,
    quotaMode: "NONE",
    maxDaysPerEvent: null,
    hrRuleStatus: "CONFIRMED",
    note: "Ngày nghỉ đã được xác định từ lịch ca, không phải ngày chưa phân ca.",
    status: "ACTIVE",
  },
];

const quotaLabel = (item: LeavePolicyCatalogItem): string => {
  if (item.deductsAnnualLeave || item.quotaMode === "ANNUAL_BALANCE")
    return "Trừ quỹ phép năm";
  if (item.quotaMode === "COMPENSATORY_BALANCE") return "Trừ quỹ nghỉ bù";
  if (item.quotaMode === "INSURANCE") return "Chế độ BHXH";
  if (item.quotaMode === "PER_EVENT") return "Giới hạn theo lần nghỉ";
  return item.paid === true
    ? "Hưởng lương"
    : item.paid === false
      ? "Không hưởng lương"
      : "Không trừ quỹ phép";
};

const dayValueLabel = (item: LeavePolicyCatalogItem): string =>
  typeof item.dayValue === "number"
    ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
        item.dayValue,
      )} công`
    : "Theo chính sách";

const requirementLabel = (item: LeavePolicyCatalogItem): string => {
  if (!item.requiresAttachment) return "Không cần chứng từ";
  return typeof item.attachmentMinDays === "number"
    ? `Cần chứng từ từ ${item.attachmentMinDays} ngày`
    : "Cần chứng từ";
};

interface TimesheetSymbolCatalogModalProps {
  code: string;
  onClose: () => void;
}

export const TimesheetSymbolCatalogModal: React.FC<
  TimesheetSymbolCatalogModalProps
> = ({ code, onClose }) => {
  const [items, setItems] = React.useState<LeavePolicyCatalogItem[] | null>(
    null,
  );
  const [error, setError] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const searchId = React.useId();

  React.useEffect(() => {
    let active = true;
    void hrApi.getLeaveTypeCatalog().then(
      (catalogItems) => {
        if (active) setItems(catalogItems);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const catalog = React.useMemo(() => {
    const seen = new Set(SYSTEM_SYMBOLS.map((item) => item.displaySymbol));
    return [
      ...SYSTEM_SYMBOLS,
      ...(items ?? []).filter((item) => {
        const symbol = timesheetSymbolLookupCode(item.displaySymbol);
        if (!symbol || seen.has(symbol)) return false;
        seen.add(symbol);
        return true;
      }),
    ];
  }, [items]);
  const selectedCode = timesheetSymbolLookupCode(code);
  const selectedItem = catalog.find(
    (item) => timesheetSymbolLookupCode(item.displaySymbol) === selectedCode,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const filteredItems = catalog.filter((item) =>
    [item.displaySymbol, item.name, item.note ?? "", quotaLabel(item)].some(
      (value) => value.toLocaleLowerCase("vi").includes(normalizedQuery),
    ),
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Tra cứu ký hiệu ngày nghỉ"
      description={
        selectedItem
          ? `${selectedItem.displaySymbol} · ${selectedItem.name}`
          : "Danh mục ký hiệu đang áp dụng trên bảng công"
      }
      size="full"
      bodyClassName="!p-0"
    >
      {selectedItem ? (
        <section className="border-b border-border bg-surface-overlay/55 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className={clsx(
                  "shrink-0 rounded-md border px-2.5 py-1 text-sm font-bold",
                  timesheetSymbolClass(selectedItem.displaySymbol),
                )}
              >
                {selectedItem.displaySymbol}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {selectedItem.name}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {selectedItem.note ||
                    "Áp dụng theo chính sách HRM hiện hành."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
              <span className="text-text-secondary">Chính sách</span>
              <span className="font-medium text-text-primary">
                {quotaLabel(selectedItem)}
              </span>
              <span className="text-text-secondary">Giá trị ngày</span>
              <span className="font-medium tabular-nums text-text-primary">
                {dayValueLabel(selectedItem)}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800 sm:px-6">
          Chưa tìm thấy mô tả cho ký hiệu <b>{code}</b> trong danh mục hiện
          hành.
        </div>
      )}

      <div className="px-5 pb-5 pt-4 sm:px-6">
        <label className="sr-only" htmlFor={searchId}>
          Tìm ký hiệu hoặc loại nghỉ
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Tìm theo ký hiệu, tên hoặc chính sách"
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {error ? (
        <div className="px-5 pb-4 sm:px-6" role="alert">
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Không tải được chính sách nghỉ từ HRM. Ký hiệu hệ thống vẫn xem
              được.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(false);
                setReloadKey((value) => value + 1);
              }}
            >
              Tải lại
            </Button>
          </div>
        </div>
      ) : null}

      {!items && !error ? (
        <div
          className="space-y-2 px-5 pb-6 sm:px-6"
          aria-label="Đang tải danh mục ký hiệu"
          aria-live="polite"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-md bg-surface-overlay motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <div className="border-t border-border">
          <div className="hidden grid-cols-[7rem_minmax(12rem,1.4fr)_minmax(10rem,1fr)_8rem_minmax(11rem,1fr)] gap-4 border-b border-border bg-surface-overlay px-6 py-3 text-xs font-semibold text-text-secondary md:grid">
            <span>Ký hiệu</span>
            <span>Loại nghỉ</span>
            <span>Chính sách</span>
            <span>Giá trị</span>
            <span>Yêu cầu</span>
          </div>
          {filteredItems.length ? (
            <ul className="max-h-[24rem] divide-y divide-border overflow-y-auto">
              {filteredItems.map((item) => {
                const isSelected =
                  timesheetSymbolLookupCode(item.displaySymbol) ===
                  selectedCode;
                return (
                  <li
                    key={item.id}
                    className={clsx(
                      "grid gap-2 px-5 py-4 text-sm md:grid-cols-[7rem_minmax(12rem,1.4fr)_minmax(10rem,1fr)_8rem_minmax(11rem,1fr)] md:items-center md:gap-4 md:px-6 md:py-3",
                      isSelected ? "bg-primary/8" : "hover:bg-surface-hover/70",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "rounded-md border px-2 py-1 font-semibold",
                          timesheetSymbolClass(item.displaySymbol),
                        )}
                      >
                        {item.displaySymbol}
                      </span>
                      {isSelected ? (
                        <span className="text-[11px] font-semibold text-primary md:hidden">
                          Đang xem
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">
                        {item.name}
                      </p>
                      {item.note ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary md:hidden">
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-text-secondary">
                      {quotaLabel(item)}
                    </span>
                    <span className="tabular-nums text-text-primary">
                      {dayValueLabel(item)}
                    </span>
                    <span className="text-text-secondary">
                      {requirementLabel(item)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              className="px-5 py-10 text-center text-sm text-text-secondary"
              role="status"
            >
              Không có ký hiệu phù hợp. Hãy thử từ khóa khác.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
