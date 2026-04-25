import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { logger } from "../utils/logger";

export const supportedLanguages = ["vi", "en"] as const;
export const defaultNamespace = "common";
export const appNamespaces = [
  "common",
  "auth",
  "chat",
  "sidebar",
  "profile",
  "error",
  "validation",
  "theme",
  "settings",
  "friends",
  "group",
] as const;

const isProduction =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.PROD);
const missingTranslationKeys = new Set<string>();

const handleMissingKey = (key: string) => {
  if (!isProduction && !missingTranslationKeys.has(key)) {
    missingTranslationKeys.add(key);
    logger.warn("i18n", "missing_translation_key", { key });
  }

  return "";
};

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`../locales/${language}/${namespace}.json`),
      ),
    )
    .use(initReactI18next)
    .init({
      ns: appNamespaces,
      defaultNS: defaultNamespace,
      fallbackNS: defaultNamespace,
      supportedLngs: [...supportedLanguages],
      fallbackLng: "vi",
      load: "languageOnly",
      returnNull: false,
      returnEmptyString: false,
      parseMissingKeyHandler: handleMissingKey,
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "chat.language",
      },
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
