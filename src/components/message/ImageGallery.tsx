import React from "react";
import type { Attachment } from "../../types";
import { ImageMessage } from "./ImageMessage";

interface ImageGalleryProps {
  conversationId: string;
  attachments: Attachment[];
  isOwn: boolean;
  onImageClick?: (imageUrl: string) => void;
}

const MAX_VISIBLE = 4;
const CONTAINER_WIDTH = 300;

interface CellConfig {
  attachment: Attachment;
  gridArea?: string;
  overlay?: number;
}

interface LayoutConfig {
  containerHeight: number;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridTemplateAreas?: string;
  cells: CellConfig[];
}

function buildLayout(attachments: Attachment[]): LayoutConfig {
  const count = attachments.length;
  const visibleCount = Math.min(count, MAX_VISIBLE);
  const remaining = count - visibleCount;
  const visible = attachments.slice(0, visibleCount);

  if (count === 2) {
    return {
      containerHeight: 160,
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr",
      cells: visible.map((a) => ({ attachment: a })),
    };
  }

  if (count === 3) {
    return {
      containerHeight: 200,
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr 1fr",
      gridTemplateAreas: '"a b" "a c"',
      cells: [
        { attachment: attachments[0], gridArea: "a" },
        { attachment: attachments[1], gridArea: "b" },
        { attachment: attachments[2], gridArea: "c" },
      ],
    };
  }

  // 4 or more: show 4 cells, last gets "+N" overlay if there are hidden images
  return {
    containerHeight: 240,
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: visible.map((a, i) => ({
      attachment: a,
      overlay: i === visibleCount - 1 && remaining > 0 ? remaining : undefined,
    })),
  };
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  conversationId,
  attachments,
  isOwn,
  onImageClick,
}) => {
  const layout = buildLayout(attachments);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        width: CONTAINER_WIDTH,
        maxWidth: "100%",
        height: layout.containerHeight,
        display: "grid",
        gap: 2,
        gridTemplateColumns: layout.gridTemplateColumns,
        gridTemplateRows: layout.gridTemplateRows,
        ...(layout.gridTemplateAreas
          ? { gridTemplateAreas: layout.gridTemplateAreas }
          : {}),
      }}
    >
      {layout.cells.map(({ attachment, gridArea, overlay }) => (
        <div
          key={attachment.id}
          className="relative overflow-hidden"
          style={gridArea ? { gridArea } : undefined}
        >
          <ImageMessage
            conversationId={conversationId}
            attachment={attachment}
            isOwn={isOwn}
            onClick={onImageClick}
            fillContainer
          />
          {overlay !== undefined && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-2xl font-bold text-white drop-shadow-md">
                +{overlay}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ImageGallery;
