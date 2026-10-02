import { secureHeaders } from "hono/secure-headers";

/**
 * Headers for the pages the SPA is served from. The CSP is the second line behind
 * the rich text sanitizer: even a payload that slipped into stored HTML cannot load
 * or run a script, since only the bundle's own files are allowed to execute.
 *
 * - `style-src 'unsafe-inline'`: PrimeVue and index.html set inline styles.
 * - `img-src https:`: rules and descriptions embed images hosted anywhere.
 * - The cross-origin isolation headers stay off: the dev frontend runs on another
 *   origin, and nothing here needs the isolation they buy.
 * - HSTS is the TLS terminator's call: a self-hosted instance may share its domain
 *   with services `includeSubDomains` would lock onto HTTPS.
 */
export const spaSecurityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  strictTransportSecurity: false,
  referrerPolicy: "strict-origin-when-cross-origin",
});
