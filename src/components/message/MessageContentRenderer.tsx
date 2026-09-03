import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useWorkShiftCatalog } from "../../hooks/useWorkShiftCatalog";
import {
  linkifyShiftCodesInHtml,
  renderShiftCodeText,
  ShiftCatalogModal,
} from "./ShiftCodeReference";
import {
  sanitizeMessageHtml,
  shouldTreatMessageContentAsRichText,
} from "../../utils/messageContent.utils";

interface MessageContentRendererProps {
  content: string;
  contentFormat?: "plain_text" | "rich_text" | "markdown";
  isOwn: boolean;
  className?: string;
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
  contentFormat,
  isOwn,
  className,
}) => {
  const { t } = useTranslation();
  const { matcher: shiftCodeMatcher } = useWorkShiftCatalog();
  const [selectedShiftCode, setSelectedShiftCode] = React.useState<
    string | null
  >(null);
  const isRich = shouldTreatMessageContentAsRichText({
    contentFormat,
    content,
  });

  if (isRich) {
    const safeHtml = sanitizeMessageHtml(content);
    const interactiveHtml = linkifyShiftCodesInHtml(
      safeHtml,
      isOwn,
      shiftCodeMatcher,
    );
    return (
      <>
        <div
          className={clsx(
            "message-rich-content min-w-0 break-words [overflow-wrap:anywhere]",
            "text-[14px] leading-[21px]",
            // Use bubble's text color so rich content (bold, italic, etc.) inherits correctly
            // — same pattern as TextMessage.tsx for consistency
            isOwn
              ? "text-[hsl(var(--chat-bubble-sent-text))]"
              : "text-text-primary",
            // Typography resets for nested HTML elements
            // text-inherit ensures formatting tags keep bubble's text color
            "[&_strong]:font-semibold [&_strong]:text-inherit",
            "[&_b]:font-semibold [&_b]:text-inherit",
            "[&_em]:italic [&_em]:text-inherit",
            "[&_i]:italic [&_i]:text-inherit",
            "[&_u]:underline [&_u]:text-inherit",
            "[&_s]:line-through [&_s]:text-inherit",
            "[&_del]:line-through [&_del]:text-inherit",
            "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:opacity-80",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
            "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
            "[&_li]:my-0.5",
            "[&_p]:m-0 [&_p+p]:mt-1",
            "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:my-1",
            "[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:whitespace-pre-wrap [&_code]:[overflow-wrap:anywhere] [&_code]:text-inherit",
            "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
            "[&_img]:max-w-full [&_img]:h-auto",
            "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-inherit",
            isOwn
              ? "[&_code]:bg-[hsl(var(--chat-bubble-sent-text))]/15"
              : "[&_code]:bg-surface-overlay",
            isOwn
              ? "[&_a]:hover:opacity-85"
              : "[&_a]:text-primary [&_a]:hover:text-secondary",
            className,
          )}
          onClick={(event) => {
            if (!(event.target instanceof Element)) return;
            const trigger = event.target.closest<HTMLButtonElement>(
              "button[data-shift-code]",
            );
            const code = trigger?.dataset.shiftCode;
            if (!trigger || !code || !event.currentTarget.contains(trigger)) {
              return;
            }
            event.stopPropagation();
            setSelectedShiftCode(code);
          }}
          // Đã qua sanitizeMessageHtml() (utils/messageContent.utils.ts): whitelist
          // thẻ + thuộc tính, và kiểm tra scheme của href (chặn javascript:/data:).
          // KHÔNG dùng DOMPurify — dependency đã gỡ. Sửa hàm sanitize phải chạy
          // kèm messageContent.utils.test.ts.
          dangerouslySetInnerHTML={{ __html: interactiveHtml }}
        />
        {selectedShiftCode ? (
          <ShiftCatalogModal
            code={selectedShiftCode}
            onClose={() => setSelectedShiftCode(null)}
          />
        ) : null}
      </>
    );
  }

  // plain_text or legacy (no contentFormat)
  return (
    <>
      <p
        className={clsx(
          "chat-message-text max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          "text-[14px] leading-[21px]",
          isOwn
            ? "text-[hsl(var(--chat-bubble-sent-text))]"
            : "text-text-primary",
          className,
        )}
      >
        {renderShiftCodeText(
          content,
          isOwn,
          setSelectedShiftCode,
          (code) => t("chat:shiftReference.open", { code }),
          shiftCodeMatcher,
        )}
      </p>
      {selectedShiftCode ? (
        <ShiftCatalogModal
          code={selectedShiftCode}
          onClose={() => setSelectedShiftCode(null)}
        />
      ) : null}
    </>
  );
};
