import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "../../ui";
import type { InlineMessageValidationState } from "../../../utils/messageLengthPolicy";

interface ComposerLengthFooterProps {
  messageValidation: InlineMessageValidationState;
  showLongPasteNotice: boolean;
  onSendAsTextFile?: () => void;
}

export const ComposerLengthFooter: React.FC<ComposerLengthFooterProps> = ({
  messageValidation,
  showLongPasteNotice,
  onSendAsTextFile,
}) => {
  const { t } = useTranslation();

  if (
    !messageValidation.showCounter &&
    !messageValidation.isOverSoftLimit &&
    !messageValidation.isOverHardLimit
  ) {
    return null;
  }

  const sendAsFileButton = onSendAsTextFile ? (
    <button
      type="button"
      onClick={onSendAsTextFile}
      className="text-xs font-semibold underline-offset-2 hover:underline"
    >
      {t("chat:composer.sendAsTextFile", {
        defaultValue: "Gửi dưới dạng tệp .txt",
      })}
    </button>
  ) : undefined;

  return (
    <div className="mt-2 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {messageValidation.isOverHardLimit ? (
          <InlineNotice
            tone="error"
            className="mb-0"
            message={t("chat:composer.hardLimitError", {
              max: messageValidation.hardLimit.toLocaleString("vi-VN"),
              defaultValue: "Tin nhắn vượt giới hạn 20.000 ký tự.",
            })}
            action={sendAsFileButton}
          />
        ) : messageValidation.isOverSoftLimit || showLongPasteNotice ? (
          <InlineNotice
            tone="warning"
            className="mb-0"
            message={
              showLongPasteNotice
                ? t("chat:composer.longPasteNotice", {
                    defaultValue:
                      "Nội dung quá dài. Bạn có thể gửi dưới dạng tệp văn bản.",
                  })
                : t("chat:composer.softLimitWarning", {
                    defaultValue:
                      "Tin nhắn khá dài. Hãy cân nhắc gửi dưới dạng tệp nếu là log hoặc tài liệu.",
                  })
            }
            action={sendAsFileButton}
          />
        ) : null}
      </div>

      {messageValidation.showCounter && (
        <p
          className={clsx(
            "shrink-0 text-[11px] font-medium",
            messageValidation.isOverHardLimit
              ? "text-danger"
              : messageValidation.isOverSoftLimit
                ? "text-warning"
                : "text-text-muted",
          )}
        >
          {messageValidation.charCount.toLocaleString("vi-VN")}/
          {messageValidation.hardLimit.toLocaleString("vi-VN")}
        </p>
      )}
    </div>
  );
};
