import React from "react";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "lucide-react";

interface AiAssistantHeroProps {
  displayName?: string;
}

export const AiAssistantHero: React.FC<AiAssistantHeroProps> = ({
  displayName,
}) => {
  const { t } = useTranslation("aiAssistant");

  const greeting = displayName
    ? t("page.greetingWithName", { name: displayName })
    : t("page.greeting");

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* AI icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
        <SparklesIcon className="h-6 w-6" strokeWidth={1.5} />
      </div>

      {/* Greeting */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {greeting}
        </h1>
        <p className="text-body-sm text-text-secondary">
          {t("page.subtitle")}
        </p>
      </div>
    </div>
  );
};
