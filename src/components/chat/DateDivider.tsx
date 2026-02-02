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
    <div className={clsx("flex items-center justify-center my-4", className)}>
      <div className="flex-1 h-px bg-gray-200" />
      <span className="px-4 py-1.5 rounded-full bg-white text-gray-500 text-xs font-medium shadow-sm">
        {formatDateDivider(date)}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
};

export default DateDivider;
