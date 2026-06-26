import React from "react";
import clsx from "clsx";
import { MapPinIcon } from "@heroicons/react/24/outline";
import type { LocationMessagePayload } from "../../types";
import {
  formatAccuracyMeters,
  openLocationInMaps,
} from "../../utils/locationMessage";

interface LocationMessageProps {
  location: LocationMessagePayload;
  isOwn: boolean;
}

export const LocationMessage: React.FC<LocationMessageProps> = ({
  location,
  isOwn,
}) => {
  const accuracy = formatAccuracyMeters(location.accuracyM);

  return (
    <button
      type="button"
      onClick={() => openLocationInMaps(location)}
      className={clsx(
        "flex min-w-[14rem] max-w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        isOwn
          ? "border-black/10 bg-black/[0.06] hover:bg-black/[0.1] dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
          : "border-border bg-surface-overlay/60 hover:bg-surface-overlay",
      )}
    >
      <span
        className={clsx(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isOwn ? "bg-black/[0.08] dark:bg-white/15" : "bg-primary/10 text-primary",
        )}
      >
        <MapPinIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Vị trí được chia sẻ</span>
        {accuracy && (
          <span className="block text-xs opacity-70">Độ chính xác {accuracy}</span>
        )}
      </span>
    </button>
  );
};
