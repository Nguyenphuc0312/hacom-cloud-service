/**
 * @fileoverview FileIcon — renders a themed icon for files based on MIME type.
 * Uses Heroicons for consistent styling across the app.
 */

import React from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  TableCellsIcon,
  PresentationChartBarIcon,
  ArchiveBoxIcon,
  CodeBracketIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";
import type { FileIconType } from "../../utils/formatFileSize";

interface FileTypeIconProps {
  type: FileIconType;
  className?: string;
}

const iconMap: Record<FileIconType, React.ElementType> = {
  image: PhotoIcon,
  video: VideoCameraIcon,
  audio: MusicalNoteIcon,
  pdf: DocumentTextIcon,
  spreadsheet: TableCellsIcon,
  presentation: PresentationChartBarIcon,
  document: DocumentTextIcon,
  archive: ArchiveBoxIcon,
  code: CodeBracketIcon,
  generic: DocumentIcon,
};

const colorMap: Record<FileIconType, string> = {
  image: "text-emerald-500",
  video: "text-violet-500",
  audio: "text-amber-500",
  pdf: "text-red-500",
  spreadsheet: "text-green-600",
  presentation: "text-orange-500",
  document: "text-blue-500",
  archive: "text-yellow-600",
  code: "text-cyan-500",
  generic: "text-text-muted",
};

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  type,
  className,
}) => {
  const Icon = iconMap[type];
  return <Icon className={clsx("h-6 w-6", colorMap[type], className)} />;
};

export default FileTypeIcon;
