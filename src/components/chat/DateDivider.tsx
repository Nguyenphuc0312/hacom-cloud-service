import React from "react";
import clsx from "clsx";
import { formatDateDivider } from "../../utils/formatTime";

interface DateDividerProps {
  date: Date;
  className?: string;
}

export const DateDivider: React.FC<DateDividerProps> = ({
  date,
  className,
}) => {
  return (
    <div className={clsx("my-5 flex items-center justify-center", className)}>
      <span
        className="rounded-full border px-3.5 py-1 text-[11px] font-medium text-text-secondary backdrop-blur"
        style={{
          backgroundColor: "hsl(var(--color-chat-pill) / 0.94)",
          borderColor: "hsl(var(--color-chat-pill-border) / 0.7)",
        }}
      >
        {formatDateDivider(date)}
      </span>
    </div>
  );
};

export default DateDivider;
