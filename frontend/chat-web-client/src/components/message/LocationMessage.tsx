import React from "react";
import clsx from "clsx";
import { MapPinIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
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
  senderName?: string;
}

// ponytail: faux-map thumbnail (SVG grid + pin) instead of a real tile image —
// no map dep, no API key, no CSP/network dependency. Swap for a Google/OSM
// static-map <img> here if a real preview is ever required.
const FauxMap: React.FC = () => (
  <svg
    className="absolute inset-0 h-full w-full text-[#1565C0]/25"
    viewBox="0 0 240 120"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <rect width="240" height="120" className="fill-[#e8eef5] dark:fill-white/5" />
    {/* roads */}
    <path d="M-10 40 L250 55" stroke="currentColor" strokeWidth="6" fill="none" opacity="0.5" />
    <path d="M70 -10 L110 130" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.4" />
    <path d="M-10 95 L250 80" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
    <path d="M170 -10 L200 130" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
    {/* faint block grid */}
    <g stroke="currentColor" strokeWidth="1" opacity="0.15">
      <path d="M0 20 H240 M0 70 H240 M0 105 H240" fill="none" />
      <path d="M30 0 V120 M140 0 V120 M210 0 V120" fill="none" />
    </g>
  </svg>
);

export const LocationMessage: React.FC<LocationMessageProps> = ({
  location,
  isOwn,
  senderName,
}) => {
  const accuracy = formatAccuracyMeters(resolveAccuracyMeters(location));
  const canOpen = isValidLocationCoordinate(location);
  const who = isOwn ? "bạn" : senderName?.trim() || "người dùng";
  const title = location.placeName || location.name || `Vị trí của ${who}`;
  const subtitle = location.address ?? "Vị trí tại thời điểm gửi";

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
        "group flex w-[15rem] max-w-full flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        isOwn
          ? "border-black/10 bg-black/[0.04] hover:bg-black/[0.07] dark:border-white/15 dark:bg-white/[0.06] dark:hover:bg-white/10"
          : "border-border bg-surface hover:bg-surface-overlay/60",
        !canOpen && "cursor-not-allowed opacity-70",
      )}
    >
      {/* Map thumbnail */}
      <span className="relative block h-[7.5rem] w-full overflow-hidden">
        <FauxMap />
        {/* center pin */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <MapPinIcon className="size-8 fill-[#1565C0] text-white drop-shadow" />
        </span>
        {/* Maps chip */}
        {canOpen && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 text-[11px] font-semibold text-[#1565C0] shadow-sm backdrop-blur-sm">
            Maps
            <ArrowTopRightOnSquareIcon className="size-3" />
          </span>
        )}
      </span>

      {/* Caption */}
      <span className="flex items-start gap-2 px-3 py-2">
        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-[#1565C0]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs opacity-75">{subtitle}</span>
          {accuracy && (
            <span className="mt-0.5 block text-xs opacity-70">Chính xác khoảng {accuracy}</span>
          )}
        </span>
      </span>
    </button>
  );
};
