import sanitize from "sanitize-html";

/**
 * Allowlist matching what the TipTap editor produces (StarterKit, TextAlign, Image).
 * Anything outside it is stripped: rich text fields are rendered as HTML, so a value
 * written straight to the API must not carry scripts, handlers or `javascript:` URLs.
 */
const RICH_TEXT_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title"],
    ol: ["start"],
    code: ["class"],
    "*": ["style"],
  },
  allowedStyles: {
    "*": { "text-align": [/^(left|right|center|justify)$/] },
  },
  allowedClasses: { code: [/^language-[\w-]+$/] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

export function sanitizeRichText(html: string): string {
  return sanitize(html, {
    ...RICH_TEXT_OPTIONS,
    // data: is only legitimate for raster images pasted into the editor
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      (frame.attribs.src ?? "").startsWith("data:") &&
      !DATA_IMAGE.test(frame.attribs.src),
  });
}

/** Same as {@link sanitizeRichText}, passing null and undefined through untouched. */
export function sanitizeOptionalRichText<T extends string | null | undefined>(html: T): T {
  return (typeof html === "string" ? sanitizeRichText(html) : html) as T;
}
