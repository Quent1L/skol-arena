/**
 * The only versioned routes an anonymous caller may reach. Everything else under the
 * version root goes through requireAuth (see ./build), so a route added later is
 * protected by default instead of having to remember to opt in.
 *
 * Entries are `METHOD /path` in Hono syntax, relative to the version root — the same
 * form the route table and the OpenAPI post-pass use. Adding a line here is a
 * deliberate act: it publishes the route to anyone, signed in or not.
 *
 * Not listed because they never enter the version app: /api/auth/* (Better Auth),
 * /api/avatars/* (image files), /api/docs, /api/openapi/*, /api/ws.
 */
export const PUBLIC_ROUTES = [
  // Pre-flight check of an invitation code before sign-up.
  "POST /invitations/validate",
  // Redeems the code. Needs a Better Auth session, checked in the handler, but no app
  // profile yet — creating one is its job, and requireAuth would refuse it with 403.
  "POST /invitations/consume",
  // Rules reading, linked from outside the app.
  "GET /game-rules/:id",
  // Sign-in methods and push key: the login screen needs them before a user is known.
  "GET /config",
  // Raw Better Auth session. Already answers 401 when signed out, and must keep
  // answering a session that has not redeemed an invitation yet.
  "GET /user/me",
] as const;

type PublicRoute = { method: string; pattern: RegExp };

const COMPILED: PublicRoute[] = PUBLIC_ROUTES.map((entry) => {
  const [method, path] = entry.split(" ") as [string, string];
  const source = path.replace(/:[^/]+/g, "[^/]+");
  return { method, pattern: new RegExp(`^${source}$`) };
});

/**
 * Whether a request may skip authentication. `path` is relative to the version root;
 * HEAD is answered by the GET handler, so it is matched as one.
 */
export function isPublicRoute(method: string, path: string): boolean {
  const effective = method === "HEAD" ? "GET" : method;
  return COMPILED.some((route) => route.method === effective && route.pattern.test(path));
}
