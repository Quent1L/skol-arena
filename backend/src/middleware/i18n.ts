import { Context, Next } from "hono";
import { runWithLang } from "../utils/i18n-context";
import { SUPPORTED_LANGUAGES } from "../config/i18n";

export async function i18nMiddleware(c: Context, next: Next) {
  // Get language from Accept-Language header or query param
  const langFromHeader = c.req.header("Accept-Language")?.split(",")[0]?.split("-")[0];
  const langFromQuery = c.req.query("lang");
  const lang = langFromQuery || langFromHeader || "fr";

  // Set language for this request
  const selectedLang = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? lang : "fr";

  c.set("lang", selectedLang);

  // Wraps the whole handler chain: anything downstream reads the language from
  // the async context instead of a mutated global.
  return runWithLang(selectedLang, () => next());
}
