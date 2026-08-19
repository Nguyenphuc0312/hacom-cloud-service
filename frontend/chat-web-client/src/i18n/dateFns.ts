import { enUS, vi } from "date-fns/locale";
import type { Locale } from "date-fns";
import i18n from "./index";

const fallbackLocale = vi;

const localeMap: Record<string, Locale> = {
  vi,
  en: enUS,
};

export const getDateFnsLocale = (): Locale => {
  const language = i18n.resolvedLanguage || i18n.language || "vi";
  const normalized = language.toLowerCase().split("-")[0];
  return localeMap[normalized] ?? fallbackLocale;
};

