/**
 * Turns a database error into something safe to show. Our own functions raise errors with plain-language
 * messages and these SQLSTATE codes; anything else could expose internals, so it gets a generic message.
 */
export const SAFE_CODES = new Set(["23514", "42501", "P0002", "23505"]);

export function friendlyDbError(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (error.code && SAFE_CODES.has(error.code) && error.message) {
    return error.message.charAt(0).toUpperCase() + error.message.slice(1).replace(/\.?$/, ".");
  }
  return fallback;
}
