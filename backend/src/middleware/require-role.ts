import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types/hono";
import { userRepository } from "../repository/user.repository";
import { ForbiddenError, ErrorCode } from "../types/errors";

/**
 * Restricts a route to super admins. Must run after `requireAuth`,
 * which resolves the `appUserId` variable.
 */
export const requireSuperAdmin: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const appUserId = c.get("appUserId");
  const currentUser = await userRepository.getById(appUserId);

  if (currentUser?.role !== "super_admin") {
    throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS);
  }

  await next();
};
