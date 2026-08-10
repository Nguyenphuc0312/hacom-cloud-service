import React from "react";

export type WorkTabId = "timesheet" | "leave";

type WorkTab = { id: WorkTabId; label: string; hint: string };

const TABS: WorkTab[] = [
  { id: "timesheet", label: "Công của tôi", hint: "Bảng công theo tháng" },
  { id: "leave", label: "Nghỉ phép của tôi", hint: "Quỹ phép và đơn nghỉ" },
];

/**
 * Thanh chuyển giữa Công / Nghỉ phép. Indicator trượt bằng transform (không
 * animate layout property) và tắt khi người dùng bật reduce-motion.
 */
export const WorkTabBar: React.FC<{
  value: WorkTabId;
  onChange: (next: WorkTabId) => void;
}> = ({ value, onChange }) => {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.id === value),
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(activeIndex + delta + TABS.length) % TABS.length];
    onChange(next.id);
  };

  return (
    <div
      role="tablist"
      aria-label="Công và nghỉ phép"
      onKeyDown={handleKeyDown}
      className="relative grid w-full max-w-md grid-cols-2 gap-1 rounded-xl border border-[#d7dce3] bg-white p-1"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#1565C0] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {TABS.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`work-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`work-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
            className={[
              "relative z-10 inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
              isActive ? "text-white" : "text-[#475569] hover:text-[#1565C0]",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default WorkTabBar;
