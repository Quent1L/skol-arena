import { generateSpecs, resolver, type GenerateSpecOptions } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { apiErrorResponseSchema } from "@skol-arena/shared/types/index";
import type { AppHonoOptional } from "../types/hono";
import { buildVersionApp } from "./build";
import { ERROR_RESPONSES } from "./describe";
import { PUBLIC_PREFIX } from "./dispatch";
import { API_VERSIONS, API_VERSION_REQUEST_HEADER, normalizeVersion } from "./versions";
import type { ApiVersion } from "./versions";

const ERROR_DESCRIPTIONS: Record<(typeof ERROR_RESPONSES)[keyof typeof ERROR_RESPONSES], string> = {
  BadRequest: "Invalid request payload or parameters",
  Unauthorized: "Authentication required",
  Forbidden: "Insufficient permissions",
  NotFound: "Resource not found",
  Conflict: "Conflicts with the current state",
  TooManyRequests: "Rate limit exceeded; see the Retry-After header",
  InternalServerError: "Unexpected server error",
};

/**
 * Docs are on by default in development and off by default in production: a
 * self-hosted instance should not have to opt out of publishing its own API
 * surface, but it should have to opt in.
 */
function docsEnabled(): boolean {
  const flag = process.env.API_DOCS_ENABLED;
  if (flag !== undefined) return flag !== "false";
  return process.env.NODE_ENV !== "production";
}

const specCache = new Map<ApiVersion, unknown>();

function specOptions(version: ApiVersion): Partial<GenerateSpecOptions> {
  return {
    documentation: {
      openapi: "3.1.0",
      info: {
        title: "Skol Arena API",
        version,
        description:
          "Tournament management API. The major version is negotiated with the " +
          `\`${API_VERSION_REQUEST_HEADER}\` request header and echoed back in ` +
          "`X-API-VERSION`. Omitting the header serves the latest version.",
      },
      // The version app's own routes are relative (/tournaments/…) because it is
      // mounted under an internal prefix. Declaring the public prefix as the server
      // is what makes the documented URLs the ones clients actually call.
      servers: [{ url: PUBLIC_PREFIX }],
      components: {
        responses: Object.fromEntries(
          Object.values(ERROR_RESPONSES).map((name) => [
            name,
            {
              description: ERROR_DESCRIPTIONS[name],
              content: { "application/json": { schema: resolver(apiErrorResponseSchema) } },
            },
          ])
        ),
      },
    },
    // Surface endpoints that carry neither a validator nor a describeRoute, so a
    // documentation gap shows up as an undescribed operation instead of vanishing.
    includeEmptyPaths: true,
  };
}

const OPERATION_KEYS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

type Operation = { parameters?: { name?: string }[] };
type Paths = Record<string, Record<string, Operation>>;

/**
 * Adds the negotiation header to every operation.
 *
 * Done as a post-pass rather than through the generator's defaultOptions: those are
 * keyed by HTTP method and are only consulted for routes that already carry a
 * validator or a describeRoute, which would leave every plain GET undocumented on
 * the one parameter that applies to all of them.
 */
function documentVersionHeader(paths: Paths, version: ApiVersion): void {
  const parameter = {
    in: "header",
    name: API_VERSION_REQUEST_HEADER,
    required: false,
    description:
      "Pins the request to a major API version. Omit it to be served the latest.",
    schema: { type: "string", enum: [...API_VERSIONS], default: version },
  };

  for (const pathItem of Object.values(paths)) {
    for (const [key, operation] of Object.entries(pathItem)) {
      if (!OPERATION_KEYS.includes(key)) continue;
      const existing = operation.parameters ?? [];
      if (existing.some((p) => p?.name === API_VERSION_REQUEST_HEADER)) continue;
      operation.parameters = [parameter, ...existing];
    }
  }
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null;

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/** Zod names an unlabelled but repeated sub-schema __schema0, __schema1, … */
const AUTO_NAMED = /^__schema\d+$/;

/** Stable, collision-resistant enough to name a definition by its content. */
function fingerprint(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) hash = ((hash * 33) ^ json.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function rewriteRefs(node: unknown, renames: Map<string, string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => rewriteRefs(child, renames));
    return;
  }
  if (!isNode(node)) return;

  const ref = node["$ref"];
  if (typeof ref === "string" && ref.startsWith(SCHEMA_REF_PREFIX)) {
    const renamed = renames.get(ref.slice(SCHEMA_REF_PREFIX.length));
    if (renamed) node["$ref"] = `${SCHEMA_REF_PREFIX}${renamed}`;
  }

  Object.values(node).forEach((child) => rewriteRefs(child, renames));
}

/**
 * Moves every local $defs block into components.schemas.
 *
 * A shared schema tagged with `.meta({ id })` is emitted as a
 * `$ref: "#/components/schemas/<id>"` plus a sibling $defs holding the definition —
 * a reference pointing where nothing has been written yet. Hoisting makes the ref
 * resolve, and is what lets an entity reused across a dozen endpoints be described
 * once instead of inlined at each of them.
 *
 * Auto-named definitions are renamed by content first. Zod restarts that counter on
 * every conversion, so two unrelated routes both produce a "__schema0" and one would
 * otherwise silently overwrite the other.
 */
function hoistDefinitions(root: Node, schemas: Node): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isNode(value)) return;

    const defs = value["$defs"];
    if (isNode(defs)) {
      const renames = new Map<string, string>();

      for (const [name, definition] of Object.entries(defs)) {
        const finalName = AUTO_NAMED.test(name)
          ? `Inline${fingerprint(definition)}`
          : name;
        if (finalName !== name) renames.set(name, finalName);

        const existing = schemas[finalName];
        if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
          // Two different shapes claiming one name would make the document lie
          // about whichever endpoint lost the race.
          throw new Error(`Conflicting OpenAPI schema definitions for "${finalName}"`);
        }
        schemas[finalName] = definition;
      }

      delete value["$defs"];
      if (renames.size > 0) rewriteRefs(value, renames);
    }

    Object.values(value).forEach(visit);
  };

  visit(root);
}

/**
 * Replaces an inlined schema with a reference whenever its shape is one already
 * named in components.schemas.
 *
 * Zod inlines the root of a conversion even when it carries an id — only nested
 * occurrences become references. Without this, an entity that is the direct
 * response body of twenty endpoints is spelled out twenty times.
 */
function dedupeAgainstComponents(root: Node, schemas: Node): void {
  const byShape = new Map<string, string>();
  for (const [name, definition] of Object.entries(schemas)) {
    byShape.set(JSON.stringify(definition), name);
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isNode(value)) return;

    for (const [key, child] of Object.entries(value)) {
      if (!isNode(child) || Array.isArray(child) || child["$ref"]) continue;
      const name = byShape.get(JSON.stringify(child));
      if (name) value[key] = { $ref: `${SCHEMA_REF_PREFIX}${name}` };
    }

    Object.values(value).forEach(visit);
  };

  visit(root);
}

async function getSpec(version: ApiVersion): Promise<unknown> {
  const cached = specCache.get(version);
  if (cached) return cached;

  const spec = await generateSpecs(buildVersionApp(version), specOptions(version));
  documentVersionHeader(spec.paths as Paths, version);

  const components = (spec.components ?? {}) as Node;
  const schemas = (components.schemas ?? {}) as Node;
  const responses = (components.responses ?? {}) as Node;

  hoistDefinitions(spec.paths as Node, schemas);
  hoistDefinitions(responses, schemas);
  dedupeAgainstComponents(spec.paths as Node, schemas);
  dedupeAgainstComponents(responses, schemas);

  components.schemas = schemas;
  (spec as Node).components = components;

  specCache.set(version, spec);
  return spec;
}

/**
 * Mounts the OpenAPI documents and the Scalar reference.
 *
 * Both live outside version negotiation (see EXEMPT_PREFIXES in ./dispatch): they
 * describe the versions rather than living inside one.
 */
export function mountApiDocs(app: AppHonoOptional): void {
  if (!docsEnabled()) return;

  app.get(`${PUBLIC_PREFIX}/openapi/:version{.+\\.json}`, async (c) => {
    const version = normalizeVersion(c.req.param("version").replace(/\.json$/, ""));
    if (!version) return c.json({ error: { code: "NOT_FOUND", message: "Unknown API version" } }, 404);
    return c.json(await getSpec(version));
  });

  app.get(
    `${PUBLIC_PREFIX}/docs`,
    Scalar({
      pageTitle: "Skol Arena API",
      sources: API_VERSIONS.map((version) => ({
        url: `${PUBLIC_PREFIX}/openapi/${version}.json`,
        title: version,
      })),
    })
  );
}

/** Exposed for tests: builds a spec without going through the HTTP layer. */
export { getSpec as generateVersionSpec };
