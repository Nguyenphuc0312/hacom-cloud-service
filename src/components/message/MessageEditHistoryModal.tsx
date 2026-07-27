import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { messageApi } from "../../services/api";
import { formatRelativeDate } from "../../utils/formatTime";

interface EditHistoryEntry {
  version: number;
  previousContent: string;
  newContent: string;
  editedBy: string;
  editedAt: string;
}

interface MessageEditHistoryModalProps {
  messageId: string;
  onClose: () => void;
}

export const MessageEditHistoryModal: React.FC<MessageEditHistoryModalProps> = ({
  messageId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await messageApi.getMessageEditHistory(messageId);
        if (!cancelled) {
          setHistory(data);
        }
      } catch {
        if (!cancelled) {
          setError(
            t("chat:message.editHistory.loadError", {
              defaultValue: "Không thể tải lịch sử chỉnh sửa.",
            }),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [messageId, t]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t("chat:message.editHistory.title", {
        defaultValue: "Lịch sử chỉnh sửa",
      })}
      tabIndex={-1}
    >
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-surface-base shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("chat:message.editHistory.title", {
              defaultValue: "Lịch sử chỉnh sửa",
            })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={t("common:actions.close")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {loading && (
            <p className="py-4 text-center text-sm text-text-muted">
              {t("common:loading.default")}
            </p>
          )}

          {!loading && error && (
            <p className="py-4 text-center text-sm text-danger">{error}</p>
          )}

          {!loading && !error && history.length === 0 && (
            <p className="py-4 text-center text-sm text-text-muted">
              {t("chat:message.editHistory.empty", {
                defaultValue: "Chưa có lịch sử chỉnh sửa.",
              })}
            </p>
          )}

          {!loading && !error && history.length > 0 && (
            <ol className="space-y-4">
              {history.map((entry, idx) => (
                <li key={entry.version} className="relative">
                  {/* Connector line except last item */}
                  {idx < history.length - 1 && (
                    <span className="absolute left-2 top-6 h-full w-px bg-border" />
                  )}
                  <div className="flex gap-3">
                    <span className="relative mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-overlay ring-2 ring-border text-[10px] font-semibold text-text-muted">
                      {entry.version}
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <p className="text-[11px] text-text-muted">
                        {t("chat:message.editHistory.editedAt", {
                          time: formatRelativeDate(new Date(entry.editedAt)),
                          defaultValue: `Chỉnh sửa lúc ${formatRelativeDate(new Date(entry.editedAt))}`,
                        })}
                      </p>
                      <div className="space-y-1 rounded-lg bg-surface-overlay/60 px-3 py-2">
                        {idx === 0 && (
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                            {t("chat:message.editHistory.original")}
                          </p>
                        )}
                        <p
                          className={clsx(
                            "text-xs text-text-muted line-through",
                          )}
                        >
                          {entry.previousContent}
                        </p>
                        <p className="text-xs text-text-primary">
                          {entry.newContent}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageEditHistoryModal;
