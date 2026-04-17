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
          "rounded-full border text-text-secondary/85 backdrop-blur",
          contract.dateDivider.pill,
        )}
        style={{
          backgroundColor: "hsl(var(--color-chat-pill) / 0.88)",
          borderColor: "hsl(var(--color-chat-pill-border) / 0.45)",
        }}
      >
        {formatDateDivider(date)}
      </span>
    </div>
  );
};

export default DateDivider;
