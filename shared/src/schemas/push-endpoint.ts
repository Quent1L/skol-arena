import { z } from "zod";

/**
 * The browser push services a Web Push subscription can point at: FCM (Chromium),
 * Mozilla (Firefox), Apple (Safari, iOS) and WNS (Edge). The server POSTs to the
 * endpoint it is given, so an endpoint outside this list would let a caller aim the
 * server at any URL, internal ones included.
 */
export const PUSH_SERVICE_HOSTNAME =
  /^(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/i;

export const pushEndpointSchema = z
  .url({ protocol: /^https$/, hostname: PUSH_SERVICE_HOSTNAME })
  .max(2048);
