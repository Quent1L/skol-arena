import { ConflictError, ErrorCode } from "../types/errors";
import { logger } from "./logger";

/**
 * Extract PostgreSQL error details from Drizzle error
 * Drizzle may wrap node-postgres errors, so we try multiple access patterns
 */
export function extractPostgresError(error: unknown): {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
} | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const err = error as Record<string, unknown>;

  // Helper to extract error from an object
  const extractFrom = (obj: Record<string, unknown>) => {
    if (obj.code && typeof obj.code === "string") {
      return {
        code: obj.code,
        constraint: obj.constraint as string | undefined,
        detail: obj.detail as string | undefined,
        message: obj.message as string | undefined,
      };
    }
    return null;
  };

  // Try direct properties (node-postgres style)
  const direct = extractFrom(err);
  if (direct) return direct;

  // Try cause property (Drizzle might wrap it)
  if (err.cause && typeof err.cause === "object") {
    const cause = extractFrom(err.cause as Record<string, unknown>);
    if (cause) return cause;
  }

  // Try originalError property
  if (err.originalError && typeof err.originalError === "object") {
    const original = extractFrom(err.originalError as Record<string, unknown>);
    if (original) return original;
  }

  // Try error property (some wrappers use this)
  if (err.error && typeof err.error === "object") {
    const nested = extractFrom(err.error as Record<string, unknown>);
    if (nested) return nested;
  }

  // Log the error structure for debugging
  logger.error(
    {
      keys: Object.keys(err),
      hasCode: "code" in err,
      hasCause: "cause" in err,
      hasOriginalError: "originalError" in err,
      errorType: err.constructor?.name,
    },
    "Could not extract PostgreSQL error. Error structure:",
  );

  return null;
}

/**
 * Handle database errors and convert to appropriate AppError
 */
export function handleDatabaseError(error: unknown, context: { operation: string; name?: string }): never {
  // Log full error structure for debugging
  logger.error({ err: error }, `Tournament ${context.operation} error:`);
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    logger.error(
      {
        constructor: err.constructor?.name,
        keys: Object.keys(err),
        code: err.code,
        message: err.message,
        cause: err.cause,
        originalError: err.originalError,
      },
      "Error structure:",
    );
  }

  const pgError = extractPostgresError(error);

  if (pgError) {
    logger.error(pgError, "Extracted PostgreSQL error:");

    if (pgError.code === "23505") {
      // Unique constraint violation
      const constraint = pgError.constraint?.toLowerCase() || "";
      const detail = pgError.detail?.toLowerCase() || "";
      const message = pgError.message?.toLowerCase() || "";

      logger.error({ constraint, detail, message }, "Unique constraint violation details:");

      // Check if it's the name constraint
      if (
        constraint.includes("name") ||
        detail.includes("name") ||
        message.includes("name") ||
        constraint.includes("tournaments_name")
      ) {
        throw new ConflictError(ErrorCode.TOURNAMENT_NAME_ALREADY_EXISTS, {
          name: context.name,
        });
      }
    }

    // Foreign key violation. Services are expected to run their own preflight and
    // answer with the blocking resources listed; this is the net for the paths
    // that don't, so a restrict FK surfaces as a 409 rather than a crash.
    if (pgError.code === "23503") {
      throw new ConflictError(ErrorCode.RESOURCE_IN_USE, {
        constraint: pgError.constraint,
      });
    }
  }

  throw error;
}
