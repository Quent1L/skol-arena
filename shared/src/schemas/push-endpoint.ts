import { z } from "zod";

/**
 * The browser push services a Web Push subscription can point at: FCM (Chromium),
 * Mozilla (Firefox), Apple (Safari, iOS) and WNS (Edge). The server POSTs to the
 * endpoint it is given, so an endpoint outside this list would let a caller aim the
 * server at any URL, internal ones included.
 */
const SUBDOMAINS = "([a-z0-9-]+\\.)*";
const PUSH_SERVICE_HOSTS = [
  "fcm\\.googleapis\\.com",
  "android\\.googleapis\\.com",
  `${SUBDOMAINS}push\\.services\\.mozilla\\.com`,
  `${SUBDOMAINS}push\\.apple\\.com`,
  `${SUBDOMAINS}notify\\.windows\\.com`,
];
export const PUSH_SERVICE_HOSTNAME = new RegExp(`^(${PUSH_SERVICE_HOSTS.join("|")})$`, "i");

export const pushEndpointSchema = z
  .url({ protocol: /^https$/, hostname: PUSH_SERVICE_HOSTNAME })
  .max(2048);
