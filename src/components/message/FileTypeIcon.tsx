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
  fileName?: string;
  className?: string;
}

type FileGlyph = { color: string; label: string; title: string };

const GLYPH_COLORS: Partial<Record<FileIconType, string>> = {
  spreadsheet: "#217346",
  document: "#546E7A",
  generic: "#78909C",
  archive: "#B58105",
  code: "#0E7490",
};

const OFFICE_GLYPHS: Record<string, FileGlyph> = {
  doc: { color: "#2B579A", label: "W", title: "Word" },
  docx: { color: "#2B579A", label: "W", title: "Word" },
  xls: { color: "#217346", label: "X", title: "Excel" },
  xlsx: { color: "#217346", label: "X", title: "Excel" },
  ppt: { color: "#D24726", label: "P", title: "PowerPoint" },
  pptx: { color: "#D24726", label: "P", title: "PowerPoint" },
  pdf: { color: "#D32F2F", label: "PDF", title: "PDF" },
};

const FileGlyphBadge: React.FC<FileGlyph & { className?: string }> = ({
  color,
  label,
  title,
  className,
}) => (
  <svg viewBox="0 0 24 24" className={className ?? "h-full w-full"} role="img" aria-label={title}>
    <rect x="0" y="0" width="24" height="24" rx="5" fill={color} />
    <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={label.length > 2 ? 6.5 : label.length > 1 ? 8 : 14} fontWeight="700" fontFamily="Segoe UI, system-ui, sans-serif">
      {label}
    </text>
  </svg>
);

const glyphForFileName = (type: FileIconType, fileName?: string): FileGlyph | null => {
  const extension = fileName?.toLowerCase().split(".").pop() ?? "";
  if (!extension) return type === "pdf" ? OFFICE_GLYPHS.pdf : null;
  if (OFFICE_GLYPHS[extension]) return OFFICE_GLYPHS[extension];
  if (/^[a-z0-9]{2,4}$/.test(extension) && GLYPH_COLORS[type]) {
    return { color: GLYPH_COLORS[type] as string, label: extension.toUpperCase(), title: extension.toUpperCase() };
  }
  return null;
};

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
  fileName,
  className,
}) => {
  const glyph = glyphForFileName(type, fileName);
  if (glyph) return <FileGlyphBadge {...glyph} className={className} />;
  const Icon = iconMap[type];
  return <Icon className={clsx("h-6 w-6", colorMap[type], className)} />;
};

export default FileTypeIcon;
