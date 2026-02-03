/**
 * @fileoverview Image Preview Modal
 * Modal xem ảnh full screen
 */

import React, { useState } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";
import { IconButton } from "../ui";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt?: string;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt = "Image preview",
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isOpen) return null;

  // Handle zoom
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Handle download
  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image-${Date.now()}.${blob.type.split("/")[1] || "jpg"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(imageUrl, "_blank");
    }
  };

  // Handle drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "+" || e.key === "=") {
      handleZoomIn();
    } else if (e.key === "-") {
      handleZoomOut();
    } else if (e.key === "0") {
      handleResetZoom();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <IconButton
          icon={<MagnifyingGlassMinusIcon className="w-5 h-5" />}
          aria-label="Zoom out"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          variant="ghost"
          className="text-white hover:bg-white/10"
        />

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleResetZoom();
          }}
          className="px-3 py-1.5 text-sm text-white hover:bg-white/10 rounded-lg"
        >
          {Math.round(scale * 100)}%
        </button>

        <IconButton
          icon={<MagnifyingGlassPlusIcon className="w-5 h-5" />}
          aria-label="Zoom in"
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          variant="ghost"
          className="text-white hover:bg-white/10"
        />

        <div className="w-px h-6 bg-white/20 mx-2" />

        <IconButton
          icon={<ArrowDownTrayIcon className="w-5 h-5" />}
          aria-label="Tải xuống"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          variant="ghost"
          className="text-white hover:bg-white/10"
        />

        <IconButton
          icon={<XMarkIcon className="w-5 h-5" />}
          aria-label="Đóng"
          onClick={onClose}
          variant="ghost"
          className="text-white hover:bg-white/10"
        />
      </div>

      {/* Image */}
      <div
        className={clsx(
          "relative max-w-full max-h-full overflow-hidden",
          scale > 1 ? "cursor-grab" : "cursor-zoom-in",
          isDragging && "cursor-grabbing",
        )}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleResetZoom}
      >
        <img
          src={imageUrl}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain transition-transform duration-200"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
          }}
          draggable={false}
        />
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        Scroll để zoom • Double-click để reset • ESC để đóng
      </div>
    </div>
  );
};

export default ImagePreviewModal;
