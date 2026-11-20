import { validator } from "hono-openapi";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Env, ValidationTargets } from "hono";
import { BadRequestError, ErrorCode } from "../types/errors";

/** Flattens a standard-schema issue path into the dotted form the client renders. */
function formatPath(issue: StandardSchemaV1.Issue): string {
  return (issue.path ?? [])
    .map((segment) =>
      typeof segment === "object" && segment !== null && "key" in segment ? String(segment.key) : String(segment),
    )
    .join(".");
}

/**
 * Request validation middleware, used everywhere in place of a direct
 * hono-openapi / @hono/zod-validator import.
 *
 * Two reasons it is wrapped rather than imported per route:
 *
 * 1. The schema is registered with the OpenAPI generator as a side effect of
 *    validating, so every documented request body and query string comes from the
 *    same declaration that enforces it — there is no second place to keep in sync.
 * 2. The failure hook. Left to its default, a validation failure answers with the
 *    validator's own `{ success: false, error, data }` shape, which is not the
 *    `{ error: { code, message, details } }` envelope every other failure uses and
 *    which the frontend interceptor reads. It also echoes the rejected payload back.
 *
 * The hook throws a BadRequestError rather than a ZodError on purpose. Zod 4's
 * exported `ZodError` does **not** extend Error — only the error `.parse()` throws
 * does — and Hono's compose rethrows anything that fails `instanceof Error` instead
 * of handing it to app.onError. A thrown ZodError therefore escapes the app
 * entirely and surfaces as a runtime crash page rather than an API error.
 */
export function validate<
  Schema extends StandardSchemaV1,
  Target extends keyof ValidationTargets,
  E extends Env = Env,
  P extends string = string,
>(target: Target, schema: Schema) {
  // Only the first four type parameters are forwarded: the remaining ones derive
  // the validated input/output types from the schema, and pinning them here would
  // erase what c.req.valid() infers at the call site.
  return validator<Schema, Target, E, P>(target, schema, (result) => {
    if (!result.success) {
      const issues = (result.error as readonly StandardSchemaV1.Issue[]).map((issue) => ({
        path: formatPath(issue),
        message: issue.message,
      }));
      throw new BadRequestError(ErrorCode.VALIDATION_ERROR, { target, issues });
    }
    return undefined;
  });
}
