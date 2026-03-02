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
    <div className={clsx("my-3 flex items-center justify-center", className)}>
      <div className="h-px flex-1 bg-border" />
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted shadow-xs">
        {formatDateDivider(date)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
};

export default DateDivider;
