/**
 * @fileoverview FileTypeIcon — icon theo loại file.
 * Word/Excel/PowerPoint/PDF dùng khối glyph chữ cái trên nền màu thương hiệu
 * (giống Zalo/Teams/hr-web-client) — nhận ra loại file trong nháy mắt.
 */
import type { ReactNode } from 'react';
import {
  Image as IconPhoto,
  Video as IconVideo,
  Music as IconMusic,
  FileText as IconFileText,
  Archive as IconFileZip,
  File as IconFile,
} from 'lucide-react';
import type { FileIconType } from '../../utils/filePreviewUtils';

interface FileTypeIconProps {
  type: FileIconType;
  fileName?: string;
  size?: number;
  className?: string;
}

const BRAND = {
  word: '#2B579A',
  excel: '#217346',
  powerpoint: '#D24726',
  pdf: '#D32F2F',
} as const;

function OfficeGlyph({ color, label, size }: { color: string; label: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}

function officeGlyphFor(type: FileIconType, fileName: string | undefined): ReactNode | null {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (type === 'pdf') return <OfficeGlyph color={BRAND.pdf} label="PDF" size={24} />;
  if (type === 'document' && (ext === 'doc' || ext === 'docx'))
    return <OfficeGlyph color={BRAND.word} label="W" size={24} />;
  if (type === 'spreadsheet' && (ext === 'xls' || ext === 'xlsx'))
    return <OfficeGlyph color={BRAND.excel} label="X" size={24} />;
  if (type === 'presentation' && (ext === 'ppt' || ext === 'pptx'))
    return <OfficeGlyph color={BRAND.powerpoint} label="P" size={24} />;
  return null;
}

export function FileTypeIcon({ type, fileName, size = 20, className }: FileTypeIconProps) {
  const glyph = officeGlyphFor(type, fileName);
  if (glyph) return <span className={className}>{glyph}</span>;

  switch (type) {
    case 'image':
      return <IconPhoto size={size} className={className} />;
    case 'video':
      return <IconVideo size={size} className={className} />;
    case 'audio':
      return <IconMusic size={size} className={className} />;
    case 'spreadsheet':
    case 'presentation':
    case 'document':
      return <IconFileText size={size} className={className} />;
    case 'archive':
      return <IconFileZip size={size} className={className} />;
    default:
      return <IconFile size={size} className={className} />;
  }
}

export default FileTypeIcon;
