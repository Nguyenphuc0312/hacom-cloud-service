import React from "react";
import {
  MicrophoneIcon,
  PhoneXMarkIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";

interface AudioCallDialogProps {
  isOpen: boolean;
  name: string;
  avatarUrl?: string;
  statusLabel?: string;
  onClose: () => void;
}

export const AudioCallDialog: React.FC<AudioCallDialogProps> = ({
  isOpen,
  name,
  avatarUrl,
  statusLabel = "Đang gọi...",
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-text-primary/50 p-4 backdrop-blur-[2px]">
      <section
        className="w-full max-w-[20rem] rounded-xl border border-border bg-surface p-6 text-center shadow-elev3"
        role="dialog"
        aria-modal="true"
        aria-label={`Gọi thoại ${name}`}
      >
        <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-[#1976D2]/12 text-xl font-semibold text-[#1565C0]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text-primary">{name}</h2>
        <p className="mt-1 text-sm text-text-muted">{statusLabel}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <CallButton label="Loa" icon={<SpeakerWaveIcon className="h-5 w-5" />} />
          <CallButton label="Tắt mic" icon={<MicrophoneIcon className="h-5 w-5" />} />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger text-text-inverse transition-micro hover:bg-danger-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
            aria-label="Kết thúc cuộc gọi"
          >
            <PhoneXMarkIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
};

const CallButton: React.FC<{ label: string; icon: React.ReactNode }> = ({
  label,
  icon,
}) => (
  <button
    type="button"
    className={clsx(
      "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-overlay text-text-secondary",
      "transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
    )}
    aria-label={label}
  >
    {icon}
  </button>
);

export default AudioCallDialog;
