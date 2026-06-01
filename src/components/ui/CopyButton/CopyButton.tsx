import { Button, message, Tooltip } from 'antd';
import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string;
  /** Display text or custom content */
  children?: React.ReactNode;
  /** Show icon only */
  iconOnly?: boolean;
  /** Success message duration in ms */
  successDuration?: number;
  /** Tooltip text when ready to copy */
  tooltipText?: string;
  /** Tooltip text when just copied */
  copiedTooltipText?: string;
  /** Button size */
  size?: 'small' | 'middle' | 'large';
}

export const CopyButton = ({
  text,
  children,
  iconOnly = false,
  successDuration = 2000,
  tooltipText = 'Sao chép',
  copiedTooltipText = 'Đã sao chép!',
  size = 'small',
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      message.success(copiedTooltipText, successDuration / 1000);
      setTimeout(() => setCopied(false), successDuration);
    } catch (err) {
      message.error('Không thể sao chép');
      console.error('Copy failed:', err);
    }
  }, [text, successDuration, copiedTooltipText]);

  const buttonContent = iconOnly ? (
    copied ? <Check size={14} /> : <Copy size={14} />
  ) : (
    <>
      <Copy size={14} />
      <span>{children ?? tooltipText}</span>
    </>
  );

  return (
    <Tooltip title={copied ? copiedTooltipText : tooltipText}>
      <Button
        type="text"
        size={size}
        onClick={handleCopy}
        className={`copy-button ${copied ? 'copy-button--copied' : ''}`}
        aria-label={copied ? copiedTooltipText : tooltipText}
      >
        {buttonContent}
      </Button>
    </Tooltip>
  );
};
