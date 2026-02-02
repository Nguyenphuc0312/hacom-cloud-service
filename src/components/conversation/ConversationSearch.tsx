import React from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  value,
  onChange,
  placeholder = "Tìm kiếm tin nhắn hoặc người dùng",
  className,
}) => {
  return (
    <div className={clsx("relative", className)}>
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          "w-full pl-10 pr-10 py-2.5 rounded-lg",
          "bg-gray-100 border-none",
          "text-gray-900 placeholder-gray-500",
          "focus:outline-none focus:ring-2 focus:ring-telegram-primary focus:bg-white",
          "transition-all duration-200",
        )}
        aria-label="Tìm kiếm cuộc trò chuyện"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Xóa tìm kiếm"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default ConversationSearch;
