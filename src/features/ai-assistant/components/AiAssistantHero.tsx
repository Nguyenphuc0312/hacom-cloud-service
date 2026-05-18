import React from "react";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "lucide-react";

export const AiAssistantHero: React.FC = () => {
  const { t } = useTranslation("aiAssistant");

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* AI icon with gradient background */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl shadow-md"
        style={{
          background: "linear-gradient(135deg, hsl(206, 100%, 41%) 0%, hsl(206, 100%, 55%) 100%)",
        }}
      >
        <SparklesIcon className="h-10 w-10 text-white" strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {t("page.title")}
        </h1>
        <p className="max-w-md text-body-sm text-text-secondary">
          {t("page.subtitle")}
        </p>
      </div>
    </div>
  );
};
