/**
 * @fileoverview FilePreviewModal — lightbox xem trước file đính kèm với giao diện
 * chuẩn theo kiểu xem file của Zalo web (giống hệt hr-web-client calendar file preview):
 * nền sáng toàn màn hình (#e9ebee), thanh dưới cùng có icon/tên/dung lượng file bên trái
 * và nút tải về / đóng bên phải, thanh zoom nổi phía trên thanh dưới cùng khi xem ảnh
 * hoặc tài liệu Word/Excel/PDF, mũi tên chuyển file hai bên khi có nhiều file.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Minimize,
  Music,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { PreviewTarget } from '../../hooks/useFilePreview';
import { getMimePreviewType, type PreviewType } from '../../utils/mimeRegistry';
import {
  formatFilePreviewMetadata,
  getIconTypeFromPreviewType,
} from '../../utils/filePreviewUtils';
import { truncateFilename } from '../../utils/truncateFilename';
import { downloadResourceWithName } from '../../utils/downloadFile';
import { markFileDownloaded } from '../../utils/downloadedFiles';
import { asString } from '../../utils/payloadGuards';
import { isPubliclyFetchableUrl } from '../../utils/publicUrl';
import { SafeImage } from '../common/SafeImage';
import {
  FileTypeIcon,
  TextPreview,
  CsvPreview,
  PdfPreview,
  ExcelPreview,
  WordPreview,
  DocumentPreview,
  ArchivePreview,
} from '../preview';
import { OfficeOnlinePreview } from '../preview/OfficeOnlinePreview';
import styles from './FilePreviewModal.module.css';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  current: PreviewTarget | null;
  currentIndex: number;
  totalItems: number;
  secureUrl: string | null;
  isLoadingUrl: boolean;
  urlError: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRefreshUrl?: () => Promise<void>;
  size?: 'full' | 'compact';
}

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  current,
  currentIndex,
  totalItems,
  secureUrl,
  isLoadingUrl,
  urlError,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onRefreshUrl,
  size = 'full',
}) => {
  const [scale, setScale] = useState(1);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const overlayRef = useRef<HTMLDivElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const officeViewerKey = `${currentIndex}:${secureUrl ?? ''}`;
  const [officeViewerState, setOfficeViewerState] = useState({
    key: officeViewerKey,
    failed: false,
  });
  const officeViewerFailed =
    officeViewerState.key === officeViewerKey && officeViewerState.failed;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Reset scale and states when opening a different item
  useEffect(() => {
    setScale(1);
    setIsZoomMenuOpen(false);
    setPageCount(1);
  }, [currentIndex, secureUrl]);

  // Keyboard navigation & escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isZoomMenuOpen) {
          setIsZoomMenuOpen(false);
        } else {
          onClose();
        }
      }
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onPrev, onNext, hasPrev, hasNext, isZoomMenuOpen]);

  // Click outside zoom menu
  useEffect(() => {
    if (!isZoomMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setIsZoomMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isZoomMenuOpen]);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isOpen && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [isOpen]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (overlayRef.current) {
      void overlayRef.current.requestFullscreen().catch(() => undefined);
    }
  };

  const att = current?.attachment;
  const rawAtt = att as (Record<string, unknown> | undefined);
  const fileName =
    asString(rawAtt?.fileName) ||
    asString(rawAtt?.originalName) ||
    asString(rawAtt?.name) ||
    'file';
  const fileSize = typeof rawAtt?.fileSize === 'number'
    ? rawAtt.fileSize
    : typeof rawAtt?.sizeBytes === 'number'
      ? rawAtt.sizeBytes
      : typeof rawAtt?.size === 'number'
        ? rawAtt.size
        : undefined;
  const mimeType = asString(rawAtt?.mimeType) || 'application/octet-stream';

  const previewType: PreviewType = useMemo(() => {
    if (!current) return 'unknown';
    return current.previewType || getMimePreviewType(mimeType, fileName);
  }, [current, mimeType, fileName]);

  const displayName = truncateFilename(fileName, 48);
  const iconType = getIconTypeFromPreviewType(previewType);
  const uploaderName =
    asString(current?.uploaderName) ||
    asString(rawAtt?.uploaderName) ||
    asString(rawAtt?.senderName);
  const uploaderAvatarUrl =
    asString(current?.uploaderAvatarUrl) ||
    asString(rawAtt?.uploaderAvatarUrl) ||
    asString(rawAtt?.senderAvatar);
  const createdAtRaw =
    current?.createdAt ?? rawAtt?.createdAt ?? rawAtt?.timestamp ?? null;
  const metadataLine = formatFilePreviewMetadata(
    uploaderName,
    createdAtRaw,
    fileSize,
  );

  const lowerName = fileName.toLowerCase();
  const lowerMimeType = mimeType.toLowerCase();
  const isDocx = lowerName.endsWith('.docx');
  const isXlsx =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerMimeType.includes('spreadsheetml') ||
    lowerMimeType.includes('ms-excel');
  const isOfficeDoc =
    previewType === 'document' || previewType === 'spreadsheet' || previewType === 'presentation';
  const isZoomable =
    previewType === 'image' || previewType === 'pdf' || (isOfficeDoc && (isDocx || isXlsx));

  if (!isOpen || !current) return null;

  const handleDownload = async () => {
    if (!secureUrl) return;
    await downloadResourceWithName(secureUrl, fileName);
    markFileDownloaded(att?.id || att?.objectKey || att?.url);
  };

  const renderContent = () => {
    if (isLoadingUrl) {
      return (
        <div style={{ color: '#495057', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#868e96', marginTop: 8 }}>
            Đang xin liên kết xem file mới nhất…
          </div>
        </div>
      );
    }

    if (urlError || !secureUrl) {
      return (
        <div style={{ color: '#495057', textAlign: 'center' }}>
          <AlertTriangle size={32} color="#fa5252" style={{ margin: '0 auto' }} />
          <div style={{ fontSize: 13, color: '#868e96', marginTop: 8 }}>
            {urlError || 'File đang được xử lý hoặc không còn khả dụng, thử lại sau.'}
          </div>
          {onRefreshUrl && (
            <button
              type="button"
              style={{
                marginTop: 12,
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid #dee2e6',
                background: '#fff',
                color: '#495057',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
              onClick={() => void onRefreshUrl()}
            >
              Thử lại
            </button>
          )}
        </div>
      );
    }

    if (previewType === 'text') {
      return <TextPreview url={secureUrl} fileName={fileName} fileSize={fileSize} />;
    }

    if (previewType === 'csv') {
      return <CsvPreview url={secureUrl} fileName={fileName} fileSize={fileSize} />;
    }

    if (previewType === 'pdf') {
      return (
        <PdfPreview
          url={secureUrl}
          fileName={fileName}
          fileSize={fileSize}
          scale={scale}
          onPageCount={setPageCount}
        />
      );
    }

    if (isOfficeDoc) {
      if (isDocx) {
        return (
          <WordPreview
            url={secureUrl}
            fileName={fileName}
            scale={scale}
            onPageCount={setPageCount}
          />
        );
      }
      if (isXlsx) {
        if (!officeViewerFailed && isPubliclyFetchableUrl(secureUrl)) {
          return (
            <OfficeOnlinePreview
              url={secureUrl}
              fileName={fileName}
              onUnavailable={() =>
                setOfficeViewerState({ key: officeViewerKey, failed: true })
              }
            />
          );
        }
        return <ExcelPreview url={secureUrl} fileName={fileName} scale={scale} />;
      }
      return (
        <DocumentPreview
          url={secureUrl}
          fileName={fileName}
          fileSize={fileSize}
          mimeType={mimeType}
          previewType={previewType}
        />
      );
    }

    if (previewType === 'archive') {
      return <ArchivePreview url={secureUrl} fileName={fileName} fileSize={fileSize} />;
    }

    if (previewType === 'image') {
      return (
        <div
          className={`${styles.mediaBox} ${size === 'compact' ? styles.mediaBoxCompact : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <SafeImage
            src={secureUrl}
            alt={fileName}
            className={`${styles.image} ${size === 'compact' ? styles.imageCompact : ''}`}
            style={{ transform: `scale(${scale})` }}
            objectFit="contain"
            loading="eager"
            draggable={false}
            retryOnSignedUrlExpired
            onRetrySource={() => void onRefreshUrl?.()}
            fallback={
              <div className={styles.mediaError}>
                <AlertTriangle size={32} />
                <span>Không tải được ảnh</span>
              </div>
            }
          />
        </div>
      );
    }

    if (previewType === 'video') {
      return (
        <div
          className={`${styles.mediaBox} ${size === 'compact' ? styles.mediaBoxCompact : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <video
            src={secureUrl}
            controls
            playsInline
            preload="metadata"
            className={`${styles.image} ${size === 'compact' ? styles.imageCompact : ''}`}
          />
        </div>
      );
    }

    if (previewType === 'audio') {
      return (
        <div
          style={{
            width: 'min(32rem, calc(100vw - 2rem))',
            borderRadius: 16,
            border: '1px solid #dee2e6',
            background: '#fff',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
            padding: 20,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#f1f3f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={22} color="#495057" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#25262b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={fileName}
              >
                {displayName}
              </div>
              <div style={{ fontSize: 12, color: '#868e96' }}>{metadataLine}</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <audio src={secureUrl} controls preload="metadata" style={{ width: '100%' }} />
          </div>
        </div>
      );
    }

    return (
      <div style={{ color: '#495057', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#868e96' }}>
          Không có bản xem trước cho định dạng này.
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước file"
      tabIndex={-1}
    >
      <div className={styles.backdrop} onClick={onClose} />

      {totalItems > 1 && hasPrev && (
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navLeft}`}
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="File trước"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {totalItems > 1 && hasNext && (
        <button
          type="button"
          className={`${styles.navBtn} ${styles.navRight}`}
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="File sau"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div className={`${styles.content} ${isZoomable ? styles.contentWithToolbar : ''}`}>
        {renderContent()}
      </div>

      {/* Chân màn hình kiểu Zalo: hàng công cụ (số trang/zoom) phía trên + hàng thông tin file phía dưới. */}
      <div className={styles.bottomChrome} onClick={(e) => e.stopPropagation()}>
        {isZoomable && (
          <div className={styles.toolbarRow}>
            <div className={styles.toolbarLeft}>
              <FileTypeIcon type={iconType} fileName={fileName} size={16} />
              {isOfficeDoc && isDocx && <span>Trang 1/{pageCount}</span>}
            </div>
            <div className={styles.toolbarRight} ref={zoomMenuRef}>
              <button
                type="button"
                className={styles.zoomTrigger}
                onClick={() => setIsZoomMenuOpen((prev) => !prev)}
                aria-label="Chọn mức thu phóng"
              >
                {Math.round(scale * 100)}%
                <ChevronDown size={14} />
              </button>

              {isZoomMenuOpen && (
                <div className={styles.zoomMenu}>
                  {ZOOM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={styles.zoomMenuItem}
                      onClick={() => {
                        setScale(preset);
                        setIsZoomMenuOpen(false);
                      }}
                    >
                      {Math.round(preset * 100)}%
                    </button>
                  ))}
                  <div className={styles.zoomMenuDivider} />
                  <button
                    type="button"
                    className={styles.zoomMenuItem}
                    onClick={() => {
                      setScale(1);
                      setIsZoomMenuOpen(false);
                    }}
                  >
                    Vừa khung hình
                  </button>
                </div>
              )}

              <button
                type="button"
                className={styles.toolbarIconBtn}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          </div>
        )}

        <div className={styles.bottomBar}>
          <div className={styles.bottomBarLeft}>
            {uploaderAvatarUrl ? (
              <SafeImage
                src={uploaderAvatarUrl}
                alt={uploaderName || ''}
                className={styles.uploaderAvatar}
                objectFit="cover"
                loading="eager"
                fallback={<FileTypeIcon type={iconType} fileName={fileName} size={22} />}
              />
            ) : (
              <FileTypeIcon type={iconType} fileName={fileName} size={22} />
            )}
            <div style={{ minWidth: 0 }}>
              <div className={styles.fileName} title={fileName}>
                {displayName}
              </div>
              <div className={styles.fileMeta}>
                {metadataLine}
                {totalItems > 1 && ` · ${currentIndex + 1}/${totalItems}`}
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => void handleDownload()}
              aria-label="Tải về"
            >
              <Download size={18} />
            </button>
            <div className={styles.actionDivider} />
            <button
              type="button"
              className={styles.actionBtn}
              onClick={onClose}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FilePreviewModal;
