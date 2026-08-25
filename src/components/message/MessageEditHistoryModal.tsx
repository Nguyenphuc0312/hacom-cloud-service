import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Modal } from "../ui/Modal";
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

// Mỗi bản ghi là 1 lần sửa: bỏ `previousContent`, giữ `newContent`. Riêng bản
// đầu tiên đóng góp thêm nội dung gốc — BE sort version tăng dần nên
// history[0].previousContent chính là bản người dùng gõ lần đầu.
const EditHistoryTimeline: React.FC<{ history: EditHistoryEntry[] }> = ({
  history,
}) => {
  const { t } = useTranslation();
  const versions = [
    {
      key: "original",
      label: t("chat:message.editHistory.original"),
      text: history[0].previousContent,
      at: null as string | null,
      isCurrent: false,
    },
    ...history.map((entry, index) => ({
      key: `v${entry.version}`,
      label: t("chat:message.editHistory.editedAt", {
        time: formatRelativeDate(new Date(entry.editedAt)),
      }),
      text: entry.newContent,
      at: entry.editedAt,
      isCurrent: index === history.length - 1,
    })),
  ];

  return (
    <ol className="space-y-0">
      {versions.map((version, index) => (
        <li key={version.key} className="relative flex gap-3 pb-5 last:pb-0">
          {/* Rãnh dọc nối các mốc, dừng ở mốc cuối */}
          {index < versions.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[3px] top-4 bottom-0 w-px bg-border"
            />
          )}

          <span
            aria-hidden="true"
            className={clsx(
              "relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full",
              // Dùng token --color-primary (theo theme) thay vì hardcode #1565C0:
              // ở dark mode màu cứng đó quá tối so với nền, không đạt contrast.
              version.isCurrent
                ? "bg-primary ring-4 ring-primary/15"
                : "bg-border",
            )}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className={clsx(
                  "text-[11px]",
                  version.isCurrent
                    ? "font-medium text-primary"
                    : "text-text-secondary",
                )}
              >
                {version.label}
              </span>
              {version.isCurrent && (
                <span className="text-[11px] text-text-secondary">
                  {t("chat:message.editHistory.current")}
                </span>
              )}
            </div>

            <p
              className={clsx(
                "mt-1 whitespace-pre-wrap break-words text-sm",
                version.isCurrent
                  ? "text-text-primary"
                  : "text-text-secondary",
              )}
            >
              {version.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
};

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
          setError(t("chat:message.editHistory.loadError"));
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

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={t("chat:message.editHistory.title")}
    >
      {loading && (
        // Skeleton theo đúng hình dạng timeline bên dưới, tránh nhảy layout
        // khi data về (product register: skeleton, không phải spinner giữa trang).
        <div className="skeleton-stage space-y-5" aria-hidden="true">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-3">
              <span className="skeleton mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-2.5 w-24 rounded" />
                <div className="skeleton h-3.5 w-4/5 rounded" />
              </div>
            </div>
          ))}
          <span className="sr-only">{t("common:loading.default")}</span>
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!loading && !error && history.length === 0 && (
        <p className="py-2 text-sm text-text-secondary">
          {t("chat:message.editHistory.empty")}
        </p>
      )}

      {!loading && !error && history.length > 0 && (
        <EditHistoryTimeline history={history} />
      )}
    </Modal>
  );
};

export default MessageEditHistoryModal;
