import React from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ClockIcon,
  DocumentTextIcon,
  ChartBarSquareIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export interface AiDataSource {
  id: string;
  nameKey: string;
  descriptionKey: string;
  status: "available" | "developing";
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const DATA_SOURCES: AiDataSource[] = [
  {
    id: "attendance",
    nameKey: "dataSources.attendance.name",
    descriptionKey: "dataSources.attendance.description",
    status: "developing",
    icon: ClockIcon,
  },
  {
    id: "documents",
    nameKey: "dataSources.documents.name",
    descriptionKey: "dataSources.documents.description",
    status: "developing",
    icon: DocumentTextIcon,
  },
  {
    id: "reports",
    nameKey: "dataSources.reports.name",
    descriptionKey: "dataSources.reports.description",
    status: "developing",
    icon: ChartBarSquareIcon,
  },
  {
    id: "internal-info",
    nameKey: "dataSources.internalInfo.name",
    descriptionKey: "dataSources.internalInfo.description",
    status: "developing",
    icon: InformationCircleIcon,
  },
];

const statusConfig = {
  available: {
    labelKey: "dataSources.status.available",
    icon: CheckCircleIcon,
    className: "bg-success/10 text-success",
  },
  developing: {
    labelKey: "dataSources.status.developing",
    icon: WrenchScrewdriverIcon,
    className: "bg-warning/10 text-warning",
  },
};

interface AiDataSourceCardsProps {
  className?: string;
}

export const AiDataSourceCards: React.FC<AiDataSourceCardsProps> = ({
  className,
}) => {
  const { t } = useTranslation("aiAssistant");

  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {t("dataSources.title")}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DATA_SOURCES.map((source) => {
          const Icon = source.icon;
          const status = statusConfig[source.status];
          const StatusIcon = status.icon;

          return (
            <div
              key={source.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-overlay">
                <Icon className="h-5 w-5 text-text-secondary" strokeWidth={1.5} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">
                    {t(source.nameKey)}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      status.className,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" strokeWidth={1.5} />
                    {t(status.labelKey)}
                  </span>
                </div>
                <p className="text-body-xs text-text-muted">
                  {t(source.descriptionKey)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
