import React from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface SidebarSearchProps {
  value: string;
  collapsed: boolean;
  onChange: (value: string) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  value,
  collapsed,
  onChange,
}) => {
  if (collapsed) {
    return (
      <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="flex h-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
      <label className="relative block">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search channels or people"
          className={clsx(
            "h-10 w-full rounded-xl border border-transparent bg-slate-100 pl-10 pr-9 text-sm",
            "text-slate-900 placeholder:text-slate-500",
            "transition-colors focus:border-telegram-primary focus:bg-white focus:outline-none",
            "dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:bg-slate-900",
          )}
          aria-label="Search conversations"
        />

        {value.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label="Clear search"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </label>
    </div>
  );
};

export default SidebarSearch;
