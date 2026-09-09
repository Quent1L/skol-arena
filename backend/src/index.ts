import type { Context, Next } from "hono";
import { z } from "zod";
import { cors } from "hono/cors";
import { getConnInfo, serveStatic, upgradeWebSocket, websocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { auth } from "./config/auth";
import { buildVersionApp } from "./api/build";
import { assertEveryVersionMounted } from "./api/registry";
import { mountApiDocs } from "./api/openapi";
import {
  INTERNAL_PREFIX,
  PUBLIC_PREFIX,
  UNSUPPORTED_VERSION_PATH,
  withApiVersion,
} from "./api/dispatch";
import {
  API_VERSIONS,
  API_VERSION_REQUEST_HEADER,
  API_VERSION_RESPONSE_HEADER,
} from "./api/versions";
import { BadRequestError, ErrorCode } from "./types/errors";
import { addUserContext } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { i18nMiddleware } from "./middleware/i18n";
import { createAppHonoOptional } from "./types/hono";
import { webSocketService } from "./services/websocket.service";
import { emailService } from "./services/email.service";
import { userService } from "./services/user.service";
import { tournamentService } from "./services/tournament.service";
import { startJobScheduler } from "./jobs/scheduler";
import { withResolvedClientIp } from "./utils/client-ip";
import { runMigrations } from "./utils/migrate";
import { initializeAdminIfNeeded } from "./utils/init-admin";
import {
  clearStaleRecalcMarkers,
  recalculateOutdatedRankedSeasons,
} from "./utils/init-mmr-engine";
import { logger } from "./utils/logger";
import { run, type Runner } from "graphile-worker";
import { taskList } from "./workers/mmr-recalculation.worker";
import { migrateStoredRules } from "./services/rules-migration.service";

await runMigrations();
// Rules are data, so they migrate like the schema does: forward-only, at startup,
// before anything can read or validate them against the current fact catalog.
await migrateStoredRules();
await initializeAdminIfNeeded();

// Non-blocking canary: surfaces a broken SMTP setup at boot instead of at the first
// password reset. verifyConnection() swallows its own error and returns false.
if (!process.env.SMTP_HOST) {
  logger.warn("SMTP_HOST not set — password reset emails cannot be sent");
} else {
  void emailService.verifyConnection().then((ok) => {
    if (!ok) {
      logger.warn("SMTP unreachable — password reset emails will fail");
    }
  });
}

let workerRunner: Runner | null = null;
try {
  workerRunner = await run({
    connectionString: process.env.DATABASE_URL!,
    taskList,
    concurrency: 1,
  });
  logger.info("Graphile Worker started");

  // Queued only once the worker is up, and non-blocking: a season replay must
  // never hold the server off its port, and a failure here leaves the stamps
  // untouched so the next boot retries.
  void recalculateOutdatedRankedSeasons().catch((err) =>
    logger.error({ err }, "Failed to queue the MMR engine upgrade recalculation"),
  );

  // A worker that died mid-replay leaves its competition flagged as recalculating.
  void clearStaleRecalcMarkers().catch((err) =>
    logger.error({ err }, "Failed to clear abandoned recalculation markers"),
  );
} catch (err) {
  logger.error({ err }, "Failed to start Graphile Worker — MMR jobs will not be processed");
}

/**
 * What a client may send over the socket. The browser WebSocket API cannot carry
 * headers, so nothing upstream validates this frame — it arrives exactly as typed.
 */
const wsClientMessageSchema = z.object({
  event: z.enum(["subscribe_tournament", "unsubscribe_tournament"]),
  tournamentId: z.uuid(),
});

const app = createAppHonoOptional();

// HTTP request logger middleware - logs at debug level.
// Matches both prefixes: version negotiation rewrites /api/... to the internal
// per-version mount before Hono ever sees the request.
app.use(`${PUBLIC_PREFIX}/*`, requestLogger);
app.use(`${INTERNAL_PREFIX}/*`, requestLogger);

async function requestLogger(c: Context, next: Next) {
  const method = c.req.method;
  const path = c.req.path;
  logger.debug(`<-- ${method} ${path}`);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.debug(`--> ${method} ${path} ${c.res.status} ${ms}ms`);
}

// Falling back to the dev origin in production blocks the real frontend on every
// credentialed request, which surfaces as an app that loads and then does nothing.
// Say so at boot rather than leaving it to be diagnosed from the browser console.
if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) {
  logger.warn(
    "FRONTEND_URL is not set in production: CORS falls back to http://localhost:5173, " +
      "so requests from the deployed frontend will be refused.",
  );
}

// CORS configuration in development mode
app.use(
  "*",
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL || "http://localhost:5173"
        : "http://localhost:5173",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", API_VERSION_REQUEST_HEADER],
    // Without this the browser hides X-API-VERSION from page scripts entirely,
    // so a client could never read back the version it was actually served.
    exposeHeaders: [API_VERSION_RESPONSE_HEADER],
  })
);

// i18n middleware (must be before routes to set language)
app.use("*", i18nMiddleware);

// Middleware to set user and session from BetterAuth
app.use("*", addUserContext);

// The request is re-headed with the address this process resolved before Better Auth
// sees it: its rate limiter would otherwise read x-forwarded-for itself, and a caller
// who sends one can then decide which window everyone's sign-in attempts land in.
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  let socket: string | null = null;
  try {
    socket = getConnInfo(c).remote.address ?? null;
  } catch {
    socket = null;
  }
  return auth.handler(withResolvedClientIp(c.req.raw, socket));
});

// OpenAPI specs and the Scalar reference. Exempt from version negotiation: they
// describe the versions rather than living inside one.
mountApiDocs(app);

// Business routes live under the internal per-version prefix. Clients never see it:
// withApiVersion() rewrites /api/... onto it from the accept-version header, and
// refuses any request that tries to address it directly.
assertEveryVersionMounted();
for (const version of API_VERSIONS) {
  app.route(`${INTERNAL_PREFIX}/${version}`, buildVersionApp(version));
}

// Reached only through a rewrite, when accept-version names a version we do not
// serve. Throwing routes the refusal through errorHandler, so it gets the same
// translated envelope as every other failure.
app.all(UNSUPPORTED_VERSION_PATH, (c) => {
  throw new BadRequestError(ErrorCode.UNSUPPORTED_API_VERSION, {
    requested: c.req.header(API_VERSION_REQUEST_HEADER) ?? "",
    supported: API_VERSIONS.join(", "),
  });
});

app.get(
  "/api/ws",
  upgradeWebSocket(async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    
    logger.debug(`[WS] Upgrade request - BetterAuth User: ${user?.id} Session: ${session?.id}`);
    
    if (!user) {
      logger.error('[WS] No user in context, rejecting connection');
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    
    const appUserId = await userService.getOrCreateAppUser(
      user.id,
      user.name || user.email
    );
    
    logger.debug(`[WS] BetterAuth user ${user.id} mapped to App user ${appUserId}`);
    
    return {
      onOpen(_event, ws) {
        logger.debug(`[WS] App user ${appUserId} connected (BetterAuth: ${user.id})`);
        webSocketService.handleConnection(ws, appUserId);
      },
      async onMessage(event, _ws) {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const parsed = wsClientMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const msg = parsed.data;

        if (msg.event === "unsubscribe_tournament") {
          webSocketService.unsubscribeFromTournament(msg.tournamentId, appUserId);
          return;
        }

        // Subscribing is a read: it opens a feed of everything happening in that
        // competition, so it answers to the same rule as reading it over HTTP.
        // The protocol has no error channel, so a refusal is simply not subscribing.
        try {
          await tournamentService.assertCanAccess(msg.tournamentId, appUserId);
        } catch {
          logger.debug(
            `[WS] App user ${appUserId} refused subscription to ${msg.tournamentId}`,
          );
          return;
        }
        webSocketService.subscribeToTournament(msg.tournamentId, appUserId);
      },
      onClose(_event, ws) {
        logger.debug(`[WS] App user ${appUserId} disconnected`);
        webSocketService.handleClose(ws, appUserId);
        webSocketService.unsubscribeUserFromAll(appUserId);
      },
      onError(event, _ws) {
        logger.error(`[WS] Error for app user ${appUserId}: %o`, event);
      }
    };
  })
);

// An unmatched API path must fail as an API path. Without this it falls through to
// the SPA catch-all below and answers 200 text/html, which reads to a client as a
// working endpoint returning nonsense. Registered after /api/ws so the upgrade
// route still wins.
const apiNotFound = (c: Context) =>
  c.json({ error: { code: ErrorCode.NOT_FOUND, message: "Not found" } }, 404);

app.all(`${INTERNAL_PREFIX}/*`, apiNotFound);
app.all(`${PUBLIC_PREFIX}/*`, apiNotFound);

// Serve static files from frontend build directory
// Only serve if FRONTEND_BUILD_PATH is configured
const frontendBuildPath = process.env.FRONTEND_BUILD_PATH;
let _indexHtmlCache: string | null = null;
/** Everything vite emits under /assets/ carries a content hash, so it can never go stale. */
const HASHED_ASSET_PATH = /^\/assets\//;

if (frontendBuildPath) {
  // Serve static assets (JS, CSS, images…) — serveStatic calls next() when file not found
  app.use(
    "/*",
    serveStatic({
      root: frontendBuildPath,
      onFound: (_path, c) => {
        // index.html, sw.js, manifest.webmanifest and version.json must revalidate on every
        // load, otherwise a client can stay pinned to a deployment it has already replaced.
        c.header(
          "Cache-Control",
          HASHED_ASSET_PATH.test(c.req.path)
            ? "public, max-age=31536000, immutable"
            : "no-cache"
        );
      }
    })
  );

  // Reaching this point for a hashed asset means the file is genuinely gone (usually a client
  // still running a previous deployment). Answering with the SPA shell hands the browser HTML
  // where it expects a font or a script: fonts then fail to decode and render as tofu, and
  // scripts surface as "Unexpected token '<'". Fail honestly instead.
  app.use("/*", async (c, next) => {
    if (HASHED_ASSET_PATH.test(c.req.path)) return c.text("Not found", 404);
    return next();
  });

  // SPA fallback: all unmatched routes serve index.html (cached in memory)
  app.use("/*", async (c) => {
    if (_indexHtmlCache === null) {
      const indexFile = Bun.file(`${frontendBuildPath}/index.html`);
      if (!(await indexFile.exists())) {
        logger.error("index.html not found in: %s", frontendBuildPath);
        return c.text("Frontend not found", 404);
      }
      _indexHtmlCache = await indexFile.text();
    }
    c.header("Cache-Control", "no-cache");
    return c.html(_indexHtmlCache);
  });
} else {
  app.get("/", (c) => {
    return c.text("Hello Hono!");
  });
}

app.onError(errorHandler);

if (typeof process !== "undefined") {
  process.on("uncaughtException", (err: Error) => {
    logger.fatal(err, "UNCAUGHT EXCEPTION");
  });

  process.on(
    "unhandledRejection",
    (reason: unknown, _promise: Promise<unknown>) => {
      logger.fatal({ reason }, "UNHANDLED PROMISE REJECTION");
    }
  );

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully");
    cronJob.stop();
    if (workerRunner) await workerRunner.stop();
    process.exit(0);
  });
}

logger.info("Hono server initialized");
logger.info("Log level: %s", logger.level);
logger.info("Error handler configured");
if (frontendBuildPath) {
  logger.info(`Static files serving enabled from: ${frontendBuildPath}`);
} else {
  logger.info("Static files serving disabled (FRONTEND_BUILD_PATH not set)");
}

// Start job scheduler for auto-finalization
const cronJob = startJobScheduler();

export default {
  fetch: withApiVersion(app.fetch),
  websocket,
};
