import React from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  Share2,
} from "lucide-react";
import { Button } from "../../../components/ui";
import type { CloudItem } from "../types";
import {
  formatBytes,
  formatCloudDateTime,
  getCloudItemTitle,
  isSafeExternalUrl,
} from "../utils/cloudFormat";
import { CloudItemIcon } from "./CloudItemIcon";

interface CloudInspectorProps {
  item: CloudItem | null;
  onClose: () => void;
}

export const CloudInspector: React.FC<CloudInspectorProps> = ({
  item,
  onClose,
}) => {
  const { t, i18n } = useTranslation("cloud");
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "vi-VN";

  if (!item) {
    return (
      <aside className="cloud-inspector cloud-inspector--empty">
        <div className="cloud-inspector__empty-icon">
          <FileCheck2 className="h-7 w-7" aria-hidden />
        </div>
        <h2>{t("inspector.empty.title")}</h2>
        <p>{t("inspector.empty.description")}</p>
        <div className="cloud-capability-list">
          <div>
            <LockKeyhole className="h-4 w-4" aria-hidden />
            <span>{t("inspector.capabilities.private")}</span>
          </div>
          <div>
            <Fingerprint className="h-4 w-4" aria-hidden />
            <span>{t("inspector.capabilities.hash")}</span>
          </div>
          <div>
            <FileCheck2 className="h-4 w-4" aria-hidden />
            <span>{t("inspector.capabilities.quota")}</span>
          </div>
        </div>
      </aside>
    );
  }

  const title = getCloudItemTitle(item, {
    text: t("item.untitledText"),
    link: t("item.untitledLink"),
    file: t("item.untitledFile"),
  });

  return (
    <aside className="cloud-inspector">
      <div className="cloud-inspector__header">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("inspector.title")}
          </p>
          <h2 className="mt-1 text-base font-semibold text-text-primary">
            {t("inspector.details")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cloud-inspector__close"
          aria-label={t("common.close")}
        >
          ?
        </button>
      </div>

      <div className="cloud-inspector__content">
        <div className="cloud-inspector__identity">
          <CloudItemIcon type={item.type} className="!h-12 !w-12" />
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-text-primary">
              {title}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              {t(`type.${item.type}`)}
            </p>
          </div>
        </div>

        {item.type === "text" && item.content ? (
          <div className="cloud-inspector__preview">
            <p>{item.content}</p>
          </div>
        ) : null}

        {item.type === "link" && item.url && isSafeExternalUrl(item.url) ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cloud-inspector__link"
          >
            <span className="truncate">{item.url}</span>
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        ) : null}

        <dl className="cloud-inspector__metadata">
          <div>
            <dt>{t("inspector.metadata.status")}</dt>
            <dd>{t(`status.${item.status}`)}</dd>
          </div>
          <div>
            <dt>{t("inspector.metadata.size")}</dt>
            <dd>{formatBytes(item.sizeBytes)}</dd>
          </div>
          <div>
            <dt>{t("inspector.metadata.created")}</dt>
            <dd>{formatCloudDateTime(item.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("inspector.metadata.updated")}</dt>
            <dd>{formatCloudDateTime(item.updatedAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("inspector.metadata.id")}</dt>
            <dd className="font-mono text-[11px]">{item.id}</dd>
          </div>
        </dl>

        <div className="cloud-inspector__actions">
          <Button
            fullWidth
            size="sm"
            variant="secondary"
            disabled
            leftIcon={<Download className="h-4 w-4" />}
            title={t("inspector.phaseLater")}
          >
            {t("inspector.actions.download")}
          </Button>
          <Button
            fullWidth
            size="sm"
            variant="secondary"
            disabled
            leftIcon={<Share2 className="h-4 w-4" />}
            title={t("inspector.phaseLater")}
          >
            {t("inspector.actions.share")}
          </Button>
        </div>

        <div className="cloud-inspector__phase-note">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          <p>{t("inspector.phaseNote")}</p>
        </div>
      </div>
    </aside>
  );
};
