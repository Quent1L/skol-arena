import i18next from "i18next";
import frLocale from "../locales/fr.json";
import enLocale from "../locales/en.json";

// Load translations (already parsed as objects by Bun/TypeScript JSON imports)
const frTranslation = frLocale;
const enTranslation = enLocale;

/** Every language a request can be rendered in. Single source for the middleware
 * and for anything that has to reason across all of them at once. */
export const SUPPORTED_LANGUAGES = ["fr", "en"] as const;

// Initialize i18next
i18next.init({
  lng: "fr", // default language
  fallbackLng: "fr",
  resources: {
    fr: { translation: frTranslation },
    en: { translation: enTranslation },
  },
  // Translations are rendered as plain text (UI text nodes, push notifications),
  // never injected as HTML. Escaping here would leak entities like &#x2F; into the output.
  interpolation: { escapeValue: false },
});

export default i18next;
