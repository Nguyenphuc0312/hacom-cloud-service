import React from "react";
import clsx from "clsx";
import { formatDateDivider } from "../../utils/formatTime";
import type { ChatDensity } from "../../stores/uiStore";
import { getTimelineDensityContract } from "./timelineDensity";

interface DateDividerProps {
  date: Date;
  density?: ChatDensity;
  className?: string;
}

export const DateDivider: React.FC<DateDividerProps> = ({
  date,
  density,
  className,
}) => {
  const contract = getTimelineDensityContract(density);

  return (
    <div
      className={clsx(
        "flex items-center justify-center",
        contract.dateDivider.outer,
        className,
      )}
    >
      <span
        className={clsx(
          "rounded-full border border-border/55 bg-[hsl(var(--chat-panel-bg))/0.92] text-text-muted/92 backdrop-blur",
          contract.dateDivider.pill,
        )}
      >
        {formatDateDivider(date)}
      </span>
    </div>
  );
};

export default DateDivider;
