import React from "react";
import {
  ArrowsPointingOutIcon,
  ComputerDesktopIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

interface VideoCallViewProps {
  isOpen: boolean;
  name: string;
  durationLabel?: string;
  onClose: () => void;
}

export const VideoCallView: React.FC<VideoCallViewProps> = ({
  isOpen,
  name,
  durationLabel = "00:24",
  onClose,
}) => {
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <section
      className="fixed inset-0 z-modal flex flex-col overflow-hidden bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Gọi video ${name}`}
    >
      <div className="flex h-14 items-center justify-between px-5">
        <div>
          <h2 className="text-sm font-semibold">{name}</h2>
          <p className="text-xs text-white/70">{durationLabel}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white transition-micro hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Toàn màn hình"
        >
          <ArrowsPointingOutIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#1976D2] to-[#1565C0] text-4xl font-semibold text-white">
            {name.slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div className="absolute bottom-24 right-5 h-32 w-44 overflow-hidden rounded-lg border border-white/20 bg-slate-800 shadow-elev3">
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            Bạn
          </div>
        </div>
      </div>

      <div className="flex h-20 items-center justify-center gap-3 bg-slate-950/90 px-4">
        <VideoCallButton label="Tắt mic" icon={<MicrophoneIcon className="h-5 w-5" />} />
        <VideoCallButton label="Tắt camera" icon={<VideoCameraIcon className="h-5 w-5" />} />
        <VideoCallButton label="Chia sẻ màn hình" icon={<ComputerDesktopIcon className="h-5 w-5" />} />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white transition-micro hover:bg-danger-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          aria-label="Kết thúc cuộc gọi"
        >
          <PhoneXMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

const VideoCallButton: React.FC<{ label: string; icon: React.ReactNode }> = ({
  label,
  icon,
}) => (
  <button
    type="button"
    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-micro hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    aria-label={label}
  >
    {icon}
  </button>
);

export default VideoCallView;
