import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

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
] as const;

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
      supportedLngs: [...supportedLanguages],
      fallbackLng: "vi",
      load: "languageOnly",
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
