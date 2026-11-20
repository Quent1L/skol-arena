import { z } from "zod";
import { describe } from "../api/describe";
import { createAppHonoOptional } from "../types/hono";

const session = createAppHonoOptional();

// GET /user/me - Current Better Auth session and user, or 401 when signed out
session.get(
  "/me",
  describe({
    tags: ["Session"],
    summary: "Get the current Better Auth session",
    description:
      "The raw Better Auth session and user. Use GET /users/me for the app profile. " +
      "Answers 401 with an empty body when no session is present.",
    auth: true,
    success: {
      description: "The active session and its user",
      // Better Auth owns these shapes and they move with its version, so they are
      // documented as opaque objects rather than mirrored field by field here.
      schema: z.object({
        session: z.record(z.string(), z.unknown()).nullable(),
        user: z.record(z.string(), z.unknown()),
      }),
    },
  }),
  (c) => {
    const currentSession = c.get("session");
    const user = c.get("user");

    if (!user) return c.body(null, 401);

    return c.json({
      session: currentSession,
      user,
    });
  },
);

export default session;
