import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewTarget } from '../../hooks/useFilePreview';
import { FilePreviewModal, type FilePreviewModalProps } from './FilePreviewModal';

vi.mock('../preview', () => ({
  FileTypeIcon: ({ fileName }: { fileName?: string }) => <span>{fileName}</span>,
  TextPreview: () => <div data-testid="text-preview" />,
  CsvPreview: () => <div data-testid="csv-preview" />,
  PdfPreview: () => <div data-testid="pdf-preview" />,
  ExcelPreview: ({ url }: { url: string }) => <div data-testid="excel-preview" data-url={url} />,
  WordPreview: () => <div data-testid="word-preview" />,
  DocumentPreview: () => <div data-testid="document-preview" />,
  ArchivePreview: () => <div data-testid="archive-preview" />,
}));

vi.mock('../preview/OfficeOnlinePreview', () => ({
  OfficeOnlinePreview: ({ url, fileName, onUnavailable }: {
    url: string;
    fileName: string;
    onUnavailable: () => void;
  }) => (
    <button type="button" data-testid="office-preview" data-url={url} onClick={onUnavailable}>
      {fileName}
    </button>
  ),
}));

vi.mock('../common/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('../../utils/downloadFile', () => ({ downloadResourceWithName: vi.fn() }));
vi.mock('../../utils/downloadedFiles', () => ({ markFileDownloaded: vi.fn() }));

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const target = (
  fileName = '1. BCC TCT 2026.xlsx',
  mimeType = XLSX_MIME,
  previewType: PreviewTarget['previewType'] = 'spreadsheet',
): PreviewTarget => ({
  attachment: { id: `attachment-${fileName}`, fileName, mimeType, fileSize: 4_282_174 },
  conversationId: 'cloud-conversation',
  previewType,
  uploaderName: 'Minh Nhật kiểm thử',
});

const props = (overrides: Partial<FilePreviewModalProps> = {}): FilePreviewModalProps => ({
  isOpen: true,
  onClose: vi.fn(),
  current: target(),
  currentIndex: 0,
  totalItems: 1,
  secureUrl: 'https://chat.hacomholdings.com.vn/files/bcc.xlsx?signature=valid',
  isLoadingUrl: false,
  urlError: null,
  hasPrev: false,
  hasNext: false,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRefreshUrl: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

afterEach(cleanup);

describe('FilePreviewModal — Excel 1:1', () => {
  it('dùng Office Online cho Excel công khai và giữ nguyên chrome hiện tại', () => {
    render(<FilePreviewModal {...props()} />);

    expect(screen.getByTestId('office-preview').getAttribute('data-url')).toContain(
      'chat.hacomholdings.com.vn',
    );
    expect(screen.getByRole('button', { name: 'Chọn mức thu phóng' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem toàn màn hình' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải về' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
  });

  it('nhận diện Excel theo MIME khi tên file không có phần mở rộng', () => {
    render(<FilePreviewModal {...props({ current: target('bao-cao', XLSX_MIME) })} />);
    expect(screen.getByTestId('office-preview')).toBeTruthy();
  });

  it('dùng SheetJS ngay với URL localhost', () => {
    render(
      <FilePreviewModal {...props({ secureUrl: 'http://localhost:5100/files/bcc.xlsx' })} />,
    );
    expect(screen.getByTestId('excel-preview')).toBeTruthy();
    expect(screen.queryByTestId('office-preview')).toBeNull();
  });

  it('rơi về SheetJS khi Office Online báo không khả dụng', () => {
    render(<FilePreviewModal {...props()} />);
    fireEvent.click(screen.getByTestId('office-preview'));
    expect(screen.getByTestId('excel-preview')).toBeTruthy();
    expect(screen.queryByTestId('office-preview')).toBeNull();
  });

  it('thử lại Office Online khi chuyển sang URL file khác', () => {
    const { rerender } = render(<FilePreviewModal {...props()} />);
    fireEvent.click(screen.getByTestId('office-preview'));

    const nextUrl = 'https://chat.hacomholdings.com.vn/files/new.xlsx?signature=new';
    rerender(
      <FilePreviewModal
        {...props({ currentIndex: 1, secureUrl: nextUrl, current: target('new.xlsx') })}
      />,
    );
    expect(screen.getByTestId('office-preview').getAttribute('data-url')).toBe(nextUrl);
    expect(screen.queryByTestId('excel-preview')).toBeNull();
  });

  it('không đổi renderer Word ngoài phạm vi Excel', () => {
    render(
      <FilePreviewModal
        {...props({
          current: target(
            'quy-dinh.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'document',
          ),
        })}
      />,
    );
    expect(screen.getByTestId('word-preview')).toBeTruthy();
    expect(screen.queryByTestId('office-preview')).toBeNull();
  });
});
