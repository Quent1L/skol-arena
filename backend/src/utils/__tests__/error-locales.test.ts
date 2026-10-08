import { describe, it, expect } from "bun:test";
import { ErrorCode } from "../../types/errors";
import fr from "../../locales/fr.json";
import en from "../../locales/en.json";

// The error middleware answers `t(`errors.${code}`)`: a code with no entry reaches
// the user as the raw key ("errors.SEASON_ALREADY_ACTIVE").
describe("error locales", () => {
  for (const [lang, locale] of [["fr", fr], ["en", en]] as const) {
    it(`translates every ErrorCode in ${lang}`, () => {
      const messages = locale.errors as Record<string, string>;
      const missing = Object.values(ErrorCode).filter((code) => !messages[code]);
      expect(missing).toEqual([]);
    });
  }
});
