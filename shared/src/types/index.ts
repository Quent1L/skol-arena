import { z } from "zod";

// ============================================
// Export all shared types
// ============================================

// Enums et types de base
export * from "./enums";

// Business types
export * from "./season-form";
export * from "./tournament-config";
export * from "./tournament-ruleset";
export * from "./tournament-editability";
export * from "./tournament";
export * from "./user";
export * from "./avatar";
export * from "./admin-user";
export * from "./maintenance";
export * from "./match";
export * from "./mmr";
export * from "./team";
export * from "./participant";
export * from "./discipline";
export * from "./outcome-type";
export * from "./outcome-reason";
export * from "./standings";
export * from "./entry";
export * from "./bracket";
export * from "./player";
export * from "./game-rules";
export * from "./rules-engine";
export * from "./ranked";
export * from "./rewind";
export * from "./tournament-stats";
export * from "./organization";
export * from "./app-config";

// ============================================
// Types utilitaires
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T = unknown> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * The envelope every failed API response uses, produced by the backend error
 * handler. `code` is an I18n key: the same failure carries the same code whatever
 * the requested language, and `message` is that code rendered in it.
 */
export const apiErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .meta({ id: "ApiError" });

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

/** Acknowledgement returned by endpoints whose only outcome is "it worked". */
export const mutationResultSchema = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
  })
  .meta({ id: "MutationResult" });

export type MutationResult = z.infer<typeof mutationResultSchema>;

// ============================================
// Utility types for date transformation
// ============================================

/**
 * Utility type that transforms all string-typed properties
 * that correspond to ISO dates into Date objects.
 * Used on the frontend side where the interceptor automatically transforms dates.
 */
export type WithClientDates<T> = {
  [K in keyof T]: T[K] extends string
    ? K extends `${string}At` | `${string}Date`
      ? Date
      : T[K]
    : T[K] extends object
    ? WithClientDates<T[K]>
    : T[K];
};

/**
 * Utility type for frontend-side API payloads.
 * Dates are accepted as Date objects, but will be serialized to strings by JSON.stringify.
 */
export type ClientPayload<T> = {
  [K in keyof T]: T[K] extends string
    ? K extends `${string}At` | `${string}Date`
      ? Date | string
      : T[K]
    : T[K];
};
