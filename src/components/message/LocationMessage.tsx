import React from "react";
import clsx from "clsx";
import { MapPinIcon } from "@heroicons/react/24/outline";
import type { LocationMessagePayload } from "../../types";
import {
  formatAccuracyMeters,
  isValidLocationCoordinate,
  openLocationInMaps,
  resolveAccuracyMeters,
} from "../../utils/locationMessage";
import { toast } from "../ui";

interface LocationMessageProps {
  location: LocationMessagePayload;
  isOwn: boolean;
}

export const LocationMessage: React.FC<LocationMessageProps> = ({
  location,
  isOwn,
}) => {
  const accuracy = formatAccuracyMeters(resolveAccuracyMeters(location));
  const canOpen = isValidLocationCoordinate(location);

  const handleOpen = React.useCallback(() => {
    if (!canOpen) return;
    const opened = openLocationInMaps(location);
    if (!opened) {
      toast.info("Không thể mở tab mới. Hãy cho phép trình duyệt mở cửa sổ bật lên.");
    }
  }, [canOpen, location]);

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={!canOpen}
      aria-label="Mở vị trí trong Google Maps"
      className={clsx(
        "group flex min-w-[14rem] max-w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        isOwn
          ? "border-black/10 bg-black/[0.06] hover:bg-black/[0.1] active:bg-black/[0.14] dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
          : "border-border bg-surface-overlay/60 hover:bg-surface-overlay active:bg-surface-active",
        !canOpen && "cursor-not-allowed opacity-70",
      )}
    >
      <span
        className={clsx(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isOwn ? "bg-black/[0.08] dark:bg-white/15" : "bg-primary/10 text-primary",
        )}
        aria-hidden="true"
      >
        <MapPinIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Vị trí được chia sẻ</span>
        <span className="block text-xs opacity-75">Vị trí tại thời điểm gửi</span>
        {accuracy && (
          <span className="mt-1 block text-xs opacity-70">Chính xác khoảng {accuracy}</span>
        )}
        {canOpen && (
          <span className="mt-2 block text-xs font-semibold text-primary underline-offset-2 group-hover:underline">
            Mở trong Google Maps
          </span>
        )}
      </span>
    </button>
  );
};
