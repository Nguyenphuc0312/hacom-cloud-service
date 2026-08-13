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
   * auto keeps the old behavior. tile is for message bubbles. outline is for
   * storage/file lists where Zalo uses thin document icons for Word/Excel/PPT.
   */
  variant?: "auto" | "tile" | "outline";
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
    // Chỉ dùng full-size khi caller không truyền kích thước. Ghép đồng thời
    // `h-full w-full` với `h-* w-*` khiến thứ tự CSS của Tailwind thắng thứ tự
    // class trong markup, từng làm glyph PDF giãn theo toàn bộ ô bảng.
    className={className ?? "h-full w-full"}
    role="img"
    aria-label={title}
  >
    <rect x="0" y="0" width="24" height="24" rx="5" fill={color} />
    <text
      x="12"
      y="12.5"
      textAnchor="middle"
      dominantBaseline="central"
      fill="#FFFFFF"
      // Chữ PDF dài hơn → phải nhỏ lại mới vừa khối.
      fontSize={label.length > 1 ? 8 : 14}
      fontWeight="700"
      fontFamily="Segoe UI, system-ui, sans-serif"
      letterSpacing={label.length > 1 ? "0.2" : "0"}
    >
      {label}
    </text>
  </svg>
);

/**
 * Tờ giấy viền mảnh kiểu Zalo, có chữ W/X/P ở giữa.
 *
 * Chữ là phần bắt buộc: nếu chỉ có khung giấy trơn thì Word và Excel trông y
 * hệt nhau, trong khi PDF cạnh bên lại là khối đỏ đặc — danh sách file mất hẳn
 * dấu hiệu nhận biết loại. Có chữ thì vẫn giữ được nét mảnh mà đọc ra loại file
 * ngay, đúng như bản trước đây.
 */
const OutlineFileGlyph: React.FC<{
  color: string;
  title: string;
  label?: string;
  className?: string;
}> = ({ color, title, label, className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className ?? "h-6 w-6"}
    style={{ color }}
    role="img"
    aria-label={title}
    fill="none"
  >
    <path
      d="M6 2.75h8.25L19 7.5v13.75H6z"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinejoin="round"
    />
    <path
      d="M14.25 2.75V7.5H19"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinejoin="round"
    />
    {label ? (
      <text
        x="12.5"
        y="15.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
        fontSize="9"
        fontWeight="700"
        fontFamily="Segoe UI, system-ui, sans-serif"
      >
        {label}
      </text>
    ) : (
      <>
        <path
          d="M9 13.25h6"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <path
          d="M9 17h4.25"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
        />
      </>
    )}
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

/**
 * Phần mở rộng → glyph. Office/PDF dùng màu thương hiệu chính thức; các loại
 * còn lại lấy nhãn là chính đuôi file (như Zalo: ZIP, PNG, MP4…) để user nhận ra
 * ngay mà không phải đọc tên file dài.
 */
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

/** Màu khối cho các loại không phải Office, theo nhóm nội dung. */
const TYPE_COLORS: Partial<Record<FileIconType, string>> = {
  image: "#22A06B",
  video: "#7C4DFF",
  audio: "#F2994A",
  archive: "#B58105",
  code: "#0E7490",
  spreadsheet: BRAND.excel,
  document: "#546E7A",
  generic: "#78909C",
};

/** Nhãn tối đa 4 ký tự cho vừa khối; đuôi dài hơn thì cắt bớt. */
const glyphLabelFromExt = (ext: string): string =>
  ext.slice(0, 4).toUpperCase();

const fileExt = (fileName: string | undefined): string =>
  fileName?.toLowerCase().split(".").pop() ?? "";

/**
 * Chọn glyph khối cho file, hoặc `null` để dùng icon outline.
 *
 * Ưu tiên phần mở rộng (chính xác nhất, phân biệt được .docx với .txt vốn cùng
 * `type` = document). Không có tên file thì chỉ dựa vào `type` cho các nhóm
 * không bị gộp nhập nhằng.
 */
function resolveOfficeGlyph(
  type: FileIconType,
  fileName: string | undefined,
  allowTypeFallback = false,
): OfficeGlyphSpec | null {
  const ext = fileExt(fileName);

  // 1. Office / PDF — màu thương hiệu, nhãn cố định.
  if (ext && EXT_GLYPHS[ext]) return EXT_GLYPHS[ext];

  // 2. Loại khác nhưng có đuôi file → khối màu theo nhóm, nhãn là đuôi file.
  //    Chỉ nhận đuôi "trông như đuôi thật" để tên kiểu "báo cáo v1.2" không biến
  //    thành nhãn "2".
  if (ext && /^[a-z0-9]{2,4}$/.test(ext) && TYPE_COLORS[type]) {
    return {
      color: TYPE_COLORS[type] as string,
      label: glyphLabelFromExt(ext),
      title: ext.toUpperCase(),
    };
  }

  // 3. Không có tên file: PDF là loại duy nhất `type` đủ tin cậy để tự quyết.
  if (allowTypeFallback) {
    if (type === "spreadsheet") return EXCEL;
    if (type === "presentation") return POWERPOINT;
    if (type === "document") return WORD;
  }

  return type === "pdf" ? PDF : null;
}

function resolveOutlineGlyph(
  type: FileIconType,
  fileName: string | undefined,
): { color: string; title: string; label?: string } | null {
  const ext = fileExt(fileName);
  if (ext === "pdf" || type === "pdf") return null;

  // Ưu tiên đuôi file: `type` gộp .txt/.md vào `document` và .csv vào
  // `spreadsheet`, nên chỉ file Office thật mới được gắn chữ W/X/P. Với upload
  // trả về mimeType chung chung (application/octet-stream → type `generic`),
  // đuôi file là căn cứ duy nhất còn lại để nhận ra Office.
  if (["xls", "xlsx", "xlsm"].includes(ext)) {
    return { color: "#16A34A", title: "Excel", label: "X" };
  }
  if (["doc", "docx", "dot", "dotx"].includes(ext)) {
    return { color: "#3B82F6", title: "Word", label: "W" };
  }
  if (["ppt", "pptx", "pps", "ppsx"].includes(ext)) {
    return { color: "#F97316", title: "PowerPoint", label: "P" };
  }

  // Không có đuôi rõ ràng thì vẫn giữ màu theo nhóm, nhưng để giấy trơn —
  // gắn nhãn "W" cho một file .txt sẽ là gán sai loại.
  if (["csv"].includes(ext) || type === "spreadsheet") {
    return { color: "#16A34A", title: "Excel" };
  }
  if (["txt", "rtf", "md"].includes(ext) || type === "document") {
    return { color: "#3B82F6", title: "Word" };
  }
  if (type === "presentation") {
    return { color: "#F97316", title: "PowerPoint" };
  }

  return null;
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  type,
  variant = "auto",
  fileName,
  className,
}) => {
  if (variant === "outline") {
    // Mọi file có đuôi rõ ràng đều dùng khối màu đặc, giống hệt `tile`.
    // Trước commit 9c26b9da cả danh sách đã như vậy; việc tách riêng kiểu
    // "giấy viền mảnh" cho Office khiến PDF nổi hẳn lên còn .docx/.xlsx chìm
    // xuống — cùng một danh sách mà hai phong cách icon. `resolveOfficeGlyph`
    // lo cả Office/PDF (màu thương hiệu) lẫn phần còn lại (màu theo nhóm,
    // nhãn là đuôi file: ZIP, PNG, MP4…).
    //
    // Vẫn để lọt xuống `resolveOutlineGlyph` các trường hợp không có đuôi
    // đáng tin — .txt/.csv gộp chung `type` với Word/Excel, gắn nhãn "W" cho
    // một file .txt là gán sai loại, nên chúng giữ giấy trơn.
    const solid = resolveOfficeGlyph(type, fileName);
    if (solid) {
      return (
        <OfficeGlyph
          color={solid.color}
          label={solid.label}
          title={solid.title}
          className={className}
        />
      );
    }

    const outline = resolveOutlineGlyph(type, fileName);
    if (outline) {
      return (
        <OutlineFileGlyph
          color={outline.color}
          title={outline.title}
          label={outline.label}
          className={className}
        />
      );
    }
  }

  const office = resolveOfficeGlyph(type, fileName, variant === "tile");
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
  return <Icon className={clsx(className ?? "h-6 w-6", colorMap[type])} />;
};

export default FileTypeIcon;
