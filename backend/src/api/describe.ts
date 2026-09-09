import { describeRoute, resolver } from "hono-openapi";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { MiddlewareHandler } from "hono";

/**
 * Failure responses shared by every endpoint. They are declared once under
 * components.responses (see ./openapi.ts) and referenced from here, so the error
 * envelope is described in exactly one place instead of at ~143 call sites.
 */
export const ERROR_RESPONSES = {
  400: "BadRequest",
  401: "Unauthorized",
  403: "Forbidden",
  404: "NotFound",
  409: "Conflict",
  429: "TooManyRequests",
  500: "InternalServerError",
} as const;

const ref = (status: keyof typeof ERROR_RESPONSES) => ({
  $ref: `#/components/responses/${ERROR_RESPONSES[status]}`,
});

type Success = {
  /** Status the handler returns on success. Defaults to 200. */
  status?: 200 | 201 | 202 | 204;
  description: string;
  /**
   * Shape of the response body, as it appears on the wire. Timestamps are strings
   * here even though services hand back Date instances: c.json() serialises them,
   * and the schema documents what a client actually receives.
   *
   * These schemas are never run against a response — they describe it. Enforcing
   * them at runtime would reject the very Date instances the handler returns, and
   * cost a full validation pass on every request for no benefit.
   */
  schema?: StandardSchemaV1;
};

export type DescribeOptions = {
  tags: string[];
  summary: string;
  description?: string;
  success?: Success;
  /** Documents 401. Set on any route behind requireAuth. */
  auth?: boolean;
  /** Documents 403. Set on any route behind a role guard. */
  role?: boolean;
  /** Documents 404. Set whenever the handler can fail to find its resource. */
  notFound?: boolean;
  /** Documents 409. Set whenever the handler can conflict with existing state. */
  conflict?: boolean;
  /** Documents 429. Set on any route behind the rateLimit middleware. */
  rateLimited?: boolean;
};

/**
 * Declares an operation for the OpenAPI document.
 *
 * Wraps describeRoute so the parts every endpoint shares — the failure envelope,
 * the validation error, the auth and not-found cases — are stated once rather than
 * repeated per route. A route only spells out what is specific to it: its tag, its
 * summary and the shape it returns.
 */
export function describe(options: DescribeOptions): MiddlewareHandler {
  const { status = 200, description, schema } = options.success ?? {
    description: "Success",
  };

  return describeRoute({
    tags: options.tags,
    summary: options.summary,
    description: options.description,
    responses: {
      [status]: {
        description,
        ...(schema
          ? { content: { "application/json": { schema: resolver(schema) } } }
          : {}),
      },
      400: ref(400),
      ...(options.auth ? { 401: ref(401) } : {}),
      ...(options.role ? { 403: ref(403) } : {}),
      ...(options.notFound ? { 404: ref(404) } : {}),
      ...(options.conflict ? { 409: ref(409) } : {}),
      ...(options.rateLimited ? { 429: ref(429) } : {}),
      500: ref(500),
    },
  });
}
