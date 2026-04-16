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
        className="rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.01em] text-text-secondary/90 backdrop-blur"
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
