import React, { useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  FileUp,
  Link2,
  Paperclip,
  SendHorizontal,
  StickyNote,
  UploadCloud,
  X,
} from "lucide-react";
import { Button, Input, Textarea } from "../../../components/ui";
import type { CloudComposerMode, CloudUploadProgress } from "../types";
import { formatBytes } from "../utils/cloudFormat";

const MAX_UPLOAD_BYTES = 100_000_000;

interface CloudComposerProps {
  isMutating: boolean;
  uploadProgress: CloudUploadProgress | null;
  onCreateText: (content: string) => Promise<boolean>;
  onCreateLink: (url: string, title: string) => Promise<boolean>;
  onUpload: (file: File) => Promise<boolean>;
}

export const CloudComposer: React.FC<CloudComposerProps> = ({
  isMutating,
  uploadProgress,
  onCreateText,
  onCreateLink,
  onUpload,
}) => {
  const { t } = useTranslation("cloud");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<CloudComposerMode>("text");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const chooseFile = (nextFile: File | undefined) => {
    setValidationError(null);
    if (!nextFile) return;
    if (nextFile.size <= 0) {
      setValidationError(t("composer.errors.emptyFile"));
      return;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setValidationError(t("composer.errors.fileTooLarge"));
      return;
    }
    setFile(nextFile);
  };

  const submitText = async () => {
    const normalized = text.trim();
    if (!normalized) {
      setValidationError(t("composer.errors.textRequired"));
      return;
    }
    setValidationError(null);
    const succeeded = await onCreateText(normalized);
    if (succeeded) setText("");
  };

  const submitLink = async () => {
    const normalizedUrl = linkUrl.trim();
    try {
      const parsed = new URL(normalizedUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setValidationError(t("composer.errors.linkInvalid"));
      return;
    }
    setValidationError(null);
    const succeeded = await onCreateLink(normalizedUrl, linkTitle.trim());
    if (succeeded) {
      setLinkUrl("");
      setLinkTitle("");
    }
  };

  const submitFile = async () => {
    if (!file) {
      setValidationError(t("composer.errors.fileRequired"));
      return;
    }
    setValidationError(null);
    const succeeded = await onUpload(file);
    if (succeeded) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const stageLabel = uploadProgress
    ? t(`upload.stage.${uploadProgress.stage}`)
    : null;

  return (
    <section className="cloud-composer">
      <div className="cloud-composer__tabs" role="tablist" aria-label={t("composer.aria")}>
        {(
          [
            ["text", StickyNote],
            ["upload", UploadCloud],
            ["link", Link2],
          ] as const
        ).map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setValidationError(null);
            }}
            className={clsx(
              "cloud-composer__tab",
              mode === key && "cloud-composer__tab--active",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(`composer.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="cloud-composer__body">
        {mode === "text" ? (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("composer.text.placeholder")}
              rows={2}
              disabled={isMutating}
              maxLength={100_000}
              aria-label={t("composer.text.aria")}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                {t("composer.text.hint")}
              </span>
              <Button
                size="sm"
                variant="brand"
                isLoading={isMutating}
                disabled={isMutating}
                onClick={() => void submitText()}
                leftIcon={<SendHorizontal className="h-4 w-4" />}
              >
                {t("composer.text.action")}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "link" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr_auto] sm:items-end">
            <Input
              label={t("composer.link.urlLabel")}
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://"
              disabled={isMutating}
            />
            <Input
              label={t("composer.link.titleLabel")}
              value={linkTitle}
              onChange={(event) => setLinkTitle(event.target.value)}
              placeholder={t("composer.link.titlePlaceholder")}
              disabled={isMutating}
            />
            <Button
              size="md"
              variant="brand"
              isLoading={isMutating}
              disabled={isMutating}
              onClick={() => void submitLink()}
              className="sm:mb-0"
            >
              {t("composer.link.action")}
            </Button>
          </div>
        ) : null}

        {mode === "upload" ? (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              aria-label={t("composer.upload.pick")}
            />
            {uploadProgress ? (
              <div className="cloud-upload-progress" role="status" aria-live="polite">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="cloud-upload-progress__icon">
                    <FileUp className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {uploadProgress.fileName}
                      </p>
                      <span className="text-xs font-semibold text-primary">
                        {uploadProgress.stage === "uploading"
                          ? `${uploadProgress.percent}%`
                          : stageLabel}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-active">
                      <span
                        className={clsx(
                          "block h-full rounded-full bg-primary transition-[width] duration-200",
                          uploadProgress.stage === "processing" && "animate-pulse",
                        )}
                        style={{
                          width:
                            uploadProgress.stage === "reserving"
                              ? "8%"
                              : uploadProgress.stage === "processing"
                                ? "100%"
                                : `${uploadProgress.percent}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-text-muted">{stageLabel}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={clsx(
                  "cloud-dropzone",
                  isDragging && "cloud-dropzone--active",
                  file && "cloud-dropzone--selected",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget === event.target) setIsDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  chooseFile(event.dataTransfer.files[0]);
                }}
              >
                {file ? (
                  <>
                    <span className="cloud-dropzone__icon">
                      <Paperclip className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {file.name}
                      </p>
                      <p className="text-xs text-text-muted">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="cloud-dropzone__remove"
                      aria-label={t("composer.upload.remove")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <Button
                      size="sm"
                      variant="brand"
                      isLoading={isMutating}
                      disabled={isMutating}
                      onClick={() => void submitFile()}
                    >
                      {t("composer.upload.action")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="cloud-dropzone__icon">
                      <UploadCloud className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {t("composer.upload.drop")}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {t("composer.upload.limit")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="brand-outline"
                      disabled={isMutating}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t("composer.upload.pick")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}

        {validationError ? (
          <p className="mt-3 text-xs font-medium text-danger" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>
    </section>
  );
};
