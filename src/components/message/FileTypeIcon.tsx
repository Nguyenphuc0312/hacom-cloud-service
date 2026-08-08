/**
 * @fileoverview FileTypeIcon — icon cho file theo loại.
 *
 * Word/Excel/PowerPoint/PDF dùng glyph có chữ (W/X/P/PDF) trên nền màu thương
 * hiệu Office, giống Zalo/Teams — nhận ra loại file trong nháy mắt, không phải
 * đọc phần mở rộng. Các loại còn lại giữ Heroicons outline cho nhất quán.
 *
 * API giữ nguyên (`type` + `className`) nên mọi chỗ đang dùng không phải sửa.
 * `className` vẫn chỉnh được kích thước; màu của glyph Office là màu thương hiệu
 * nên cố ý bỏ qua class màu truyền vào.
 */

import React from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentTextIcon,
  ArchiveBoxIcon,
  CodeBracketIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";
import type { FileIconType } from "../../utils/formatFileSize";

interface FileTypeIconProps {
  type: FileIconType;
  /**
   * Tên file, để phân biệt Office thật với các loại dùng chung `type`.
   *
   * Cần thiết vì `getFileIconType` gộp `.txt/.md/.rtf` vào `document` và `.csv`
   * vào `spreadsheet` — không có tên file thì `.txt` sẽ hiện glyph "W" của Word,
   * `.csv` hiện "X" của Excel. Không truyền → chỉ PDF dùng glyph, còn lại giữ
   * icon outline (an toàn, không bao giờ gán nhãn sai).
   */
  fileName?: string;
  className?: string;
}

/** Màu thương hiệu chính thức của từng định dạng. */
const BRAND = {
  word: "#2B579A",
  excel: "#217346",
  powerpoint: "#D24726",
  pdf: "#D32F2F",
} as const;

/**
 * Glyph kiểu Office: khối bo góc màu thương hiệu + chữ cái ở giữa.
 * Dùng viewBox 24 để khớp kích thước Heroicons (h-6 w-6 mặc định).
 */
const OfficeGlyph: React.FC<{
  color: string;
  label: string;
  title: string;
  className?: string;
}> = ({ color, label, title, className }) => (
  <svg
    viewBox="0 0 24 24"
    className={clsx("h-6 w-6", className)}
    role="img"
    aria-label={title}
  >
    <rect x="2.5" y="2" width="19" height="20" rx="3" fill={color} />
    <text
      x="12"
      y="12.5"
      textAnchor="middle"
      dominantBaseline="central"
      fill="#FFFFFF"
      // Chữ PDF dài hơn → phải nhỏ lại mới vừa khối.
      fontSize={label.length > 1 ? 7 : 11}
      fontWeight="700"
      fontFamily="Segoe UI, system-ui, sans-serif"
      letterSpacing={label.length > 1 ? "0.2" : "0"}
    >
      {label}
    </text>
  </svg>
);

const iconMap: Record<FileIconType, React.ElementType> = {
  image: PhotoIcon,
  video: VideoCameraIcon,
  audio: MusicalNoteIcon,
  pdf: DocumentTextIcon,
  spreadsheet: DocumentTextIcon,
  presentation: DocumentTextIcon,
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

type OfficeGlyphSpec = { color: string; label: string; title: string };

const WORD: OfficeGlyphSpec = { color: BRAND.word, label: "W", title: "Word" };
const EXCEL: OfficeGlyphSpec = { color: BRAND.excel, label: "X", title: "Excel" };
const POWERPOINT: OfficeGlyphSpec = {
  color: BRAND.powerpoint,
  label: "P",
  title: "PowerPoint",
};
const PDF: OfficeGlyphSpec = { color: BRAND.pdf, label: "PDF", title: "PDF" };

/** Phần mở rộng Office thật → glyph tương ứng. */
const EXT_GLYPHS: Record<string, OfficeGlyphSpec> = {
  doc: WORD,
  docx: WORD,
  dot: WORD,
  dotx: WORD,
  xls: EXCEL,
  xlsx: EXCEL,
  xlsm: EXCEL,
  ppt: POWERPOINT,
  pptx: POWERPOINT,
  pps: POWERPOINT,
  ppsx: POWERPOINT,
  pdf: PDF,
};

/**
 * Chọn glyph Office cho file, hoặc `null` để dùng icon outline.
 *
 * Có tên file → quyết theo phần mở rộng (chính xác nhất). Không có tên → chỉ
 * `pdf` là an toàn, vì `document`/`spreadsheet` còn gộp cả .txt/.csv.
 */
function resolveOfficeGlyph(
  type: FileIconType,
  fileName: string | undefined,
): OfficeGlyphSpec | null {
  const ext = fileName?.toLowerCase().split(".").pop() ?? "";
  if (ext && EXT_GLYPHS[ext]) return EXT_GLYPHS[ext];
  // PDF là loại duy nhất `type` đủ tin cậy để tự quyết (không gộp loại nào khác).
  return type === "pdf" ? PDF : null;
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  type,
  fileName,
  className,
}) => {
  const office = resolveOfficeGlyph(type, fileName);
  if (office) {
    return (
      <OfficeGlyph
        color={office.color}
        label={office.label}
        title={office.title}
        className={className}
      />
    );
  }

  const Icon = iconMap[type];
  return <Icon className={clsx("h-6 w-6", colorMap[type], className)} />;
};

export default FileTypeIcon;
