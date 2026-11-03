// ============================================
// Translatable validation messages
// ============================================
// Shared schemas never carry a sentence in a given language: they carry an i18n
// key, resolved when the issue is raised rather than when the schema is built.
// The frontend registers its translator once, so a form shows its errors in the
// locale active at validation time and follows a language switch without a
// reload. The backend registers nothing: its issues carry the key itself, like
// every other backend error.

export type ValidationParams = Record<string, string | number>;
export type ValidationTranslator = (
  key: string,
  params?: ValidationParams,
) => string;

const identity: ValidationTranslator = (key) => key;

let translator: ValidationTranslator = identity;

/** Installs the function that turns a validation key into a message. */
export function setValidationTranslator(fn: ValidationTranslator | null): void {
  translator = fn ?? identity;
}

/** Resolves a validation key with the current translator. */
export function translateValidation(
  key: string,
  params?: ValidationParams,
): string {
  return translator(key, params);
}

/**
 * A Zod error param whose message is resolved lazily, at validation time.
 * Usable wherever Zod takes an error param: `.min(3, vmsg(k))`,
 * `z.string(vmsg(k))`, `.refine(fn, { ...vmsg(k), path })`.
 */
export function vmsg(
  key: string,
  params?: ValidationParams,
): { error: () => string } {
  return { error: () => translator(key, params) };
}
