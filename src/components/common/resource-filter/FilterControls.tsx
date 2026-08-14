/**
 * Filter chip + popover + date-range picker shared by the global search overlay
 * and the shared-resources ("Kho lưu trữ") modal, so both read and behave the
 * same way.
 */
import React, { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  buildMonthCells,
  displayToIso,
  isoToDisplay,
  maskDateInput,
  toLocalIsoDay,
} from "./dateRange";

export const FilterChip: React.FC<{
  icon: React.ReactNode;
  /** Node, not string: the sender chip renders a component that resolves the alias. */
  label: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-micro",
      active
        ? "border-[#1976D2]/50 bg-[#1976D2]/8 text-[#1565C0]"
        : "border-border/70 bg-surface text-text-secondary hover:bg-surface-overlay",
    )}
  >
    <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
    <span className="max-w-[9rem] truncate">{label}</span>
    <ChevronDownIcon className="h-3.5 w-3.5 opacity-70" />
  </button>
);

/**
 * A small popover under its trigger. `align="right"` anchors to the trigger's
 * right edge so it opens leftward — needed for chips near the panel's right
 * edge (the sidebar is narrow and clips overflow, so a left-aligned popover
 * would be cut off).
 */
export const Popover: React.FC<{
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  children: React.ReactNode;
}> = ({ open, onClose, align = "left", children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-dropdown" onClick={onClose} aria-hidden />
      <div
        className={clsx(
          "absolute top-full z-dropdown mt-1.5 min-w-[220px] rounded-lg border border-border/70 bg-surface p-1.5 shadow-lg",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </>
  );
};

// --- mini month calendar (self-contained; no picker lib) ---------------------

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTH_LABEL = (y: number, m0: number) => `Tháng ${m0 + 1}, ${y}`;

interface MiniMonthCalendarProps {
  /** Currently selected range (ISO yyyy-mm-dd) for highlighting. */
  from: string | null;
  to: string | null;
  /** Month to show first (ISO of any day in it), defaults to `from` or today. */
  initialIso?: string | null;
  onPick: (iso: string) => void;
}

const MiniMonthCalendar: React.FC<MiniMonthCalendarProps> = ({
  from,
  to,
  initialIso,
  onPick,
}) => {
  const seed = initialIso || from || toLocalIsoDay(new Date());
  const seedDate = new Date(`${seed}T00:00:00`);
  const [view, setView] = useState(() => ({
    year: seedDate.getFullYear(),
    month0: seedDate.getMonth(),
  }));

  const todayIso = toLocalIsoDay(new Date());
  const cells = buildMonthCells(view.year, view.month0);

  const inRange = (iso: string): boolean =>
    Boolean(from && to && iso >= from && iso <= to);
  const isEndpoint = (iso: string): boolean => iso === from || iso === to;

  const step = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month0 + delta, 1);
      return { year: d.getFullYear(), month0: d.getMonth() };
    });

  return (
    <div className="w-[240px] select-none px-1 pb-1">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold text-text-primary">
          {MONTH_LABEL(view.year, view.month0)}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted transition-micro hover:bg-surface-overlay hover:text-text-primary"
            aria-label="Tháng trước"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted transition-micro hover:bg-surface-overlay hover:text-text-primary"
            aria-label="Tháng sau"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w} className="text-[11px] font-medium text-text-muted">
            {w}
          </span>
        ))}
        {cells.map((cell) => {
          const selected = isEndpoint(cell.iso);
          const ranged = inRange(cell.iso) && !selected;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onPick(cell.iso)}
              className={clsx(
                "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] transition-micro",
                selected
                  ? "bg-[#1565C0] font-semibold text-[#E7E9EB]"
                  : ranged
                    ? "bg-[#1976D2]/12 text-text-primary"
                    : cell.inMonth
                      ? "text-text-primary hover:bg-surface-overlay"
                      : "text-text-muted/60 hover:bg-surface-overlay",
                !selected && isToday && "ring-1 ring-[#1976D2]/60",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const DateRangeFields: React.FC<{
  from: string | null;
  to: string | null;
  onApply: (from: string | null, to: string | null) => void;
  onCancel: () => void;
}> = ({ from, to, onApply, onCancel }) => {
  const { t } = useTranslation();
  const [localFrom, setLocalFrom] = useState(isoToDisplay(from ?? ""));
  const [localTo, setLocalTo] = useState(isoToDisplay(to ?? ""));

  const fromInvalid = localFrom.length > 0 && displayToIso(localFrom) === null;
  const toInvalid = localTo.length > 0 && displayToIso(localTo) === null;

  const fromIso = displayToIso(localFrom);
  const toIsoVal = displayToIso(localTo);

  // Calendar range pick: no from (or a complete range already) → start over
  // with this day as from; otherwise close the range (swap if picked earlier).
  const handlePick = (iso: string) => {
    if (!fromIso || (fromIso && toIsoVal)) {
      setLocalFrom(isoToDisplay(iso));
      setLocalTo("");
      return;
    }
    if (iso < fromIso) {
      setLocalTo(localFrom);
      setLocalFrom(isoToDisplay(iso));
    } else {
      setLocalTo(isoToDisplay(iso));
    }
  };

  const inputClass = (invalid: boolean) =>
    clsx(
      "w-full rounded-md border bg-background px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none",
      invalid
        ? "border-danger/70 focus:border-danger"
        : "border-border/70 focus:border-[#1976D2]/60",
    );

  return (
    <div className="w-[248px] p-1.5">
      <p className="px-1 pb-1.5 text-[12px] font-medium text-text-secondary">
        {t("sidebar:globalSearch.filter.pickRange")}
      </p>
      <div className="mb-2 flex gap-1.5 px-1">
        <label className="block flex-1">
          <span className="mb-0.5 block text-[11px] text-text-muted">
            {t("sidebar:globalSearch.filter.from")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={localFrom}
            onChange={(e) => setLocalFrom(maskDateInput(e.target.value))}
            className={inputClass(fromInvalid)}
          />
        </label>
        <label className="block flex-1">
          <span className="mb-0.5 block text-[11px] text-text-muted">
            {t("sidebar:globalSearch.filter.to")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={localTo}
            onChange={(e) => setLocalTo(maskDateInput(e.target.value))}
            className={inputClass(toInvalid)}
          />
        </label>
      </div>

      <div className="mb-1.5 border-t border-border/50 pt-1.5">
        <MiniMonthCalendar
          from={fromIso}
          to={toIsoVal}
          initialIso={fromIso ?? toIsoVal}
          onPick={handlePick}
        />
      </div>

      <div className="flex justify-end gap-1.5 px-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-micro hover:bg-surface-overlay"
        >
          {t("sidebar:globalSearch.filter.cancel")}
        </button>
        <button
          type="button"
          disabled={fromInvalid || toInvalid}
          onClick={() => onApply(displayToIso(localFrom), displayToIso(localTo))}
          className="rounded-md bg-[#1565C0] px-3 py-1.5 text-[13px] font-medium text-[#E7E9EB] transition-micro hover:bg-[#1976D2] disabled:opacity-50"
        >
          {t("sidebar:globalSearch.filter.confirm")}
        </button>
      </div>
    </div>
  );
};
