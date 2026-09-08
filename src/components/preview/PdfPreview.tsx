/**
 * Compatibility surface for older callers of `PdfPreview`.
 *
 * The renderer is intentionally delegated to `PdfJsViewer` so no eager,
 * all-pages PDF implementation can re-enter the product.
 */
import { PdfJsViewer } from "./PdfJsViewer";

interface PdfPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  scale?: number;
  onPageCount?: (count: number) => void;
}

export function PdfPreview({
  url,
  fileName,
  fileSize,
  scale,
  onPageCount,
}: PdfPreviewProps) {
  return (
    <PdfJsViewer
      embedded
      url={url}
      fileName={fileName}
      fileSize={fileSize}
      scale={scale}
      onPageCount={onPageCount}
    />
  );
}

export default PdfPreview;
