/**
 * @fileoverview FileName — displays a filename so that the extension always stays
 * visible while the (long) base name truncates with an ellipsis to fit the available
 * width. This is the "proper" Zalo/Telegram style for document file names:
 *
 *   "Evaluating Background Bias in Lightweight Models for Tea Leaf Disea….pdf"
 *
 * instead of a fixed mid-string cut that hides part of the extension.
 */

import React from "react";
import clsx from "clsx";
import { splitFileName } from "../../utils/truncateFilename";

interface FileNameProps {
  name: string;
  /** Extra classes for the wrapper (font-size, color, weight, etc.) */
  className?: string;
  /** Tooltip text. Defaults to the full filename. */
  title?: string;
}

/**
 * Renders a filename with CSS-based truncation: the base name truncates with an
 * ellipsis while the extension is pinned and always shown. Adapts to the parent
 * width — the parent must allow shrinking (e.g. `min-w-0`).
 */
const FileNameComponent: React.FC<FileNameProps> = ({ name, className, title }) => {
  const { base, ext } = splitFileName(name);

  return (
    <span
      className={clsx("flex min-w-0 items-baseline", className)}
      title={title ?? name}
    >
      <span className="min-w-0 truncate">{base}</span>
      {ext ? <span className="shrink-0">{ext}</span> : null}
    </span>
  );
};

export const FileName = React.memo(FileNameComponent);

export default FileName;
