/**
 * Session cookies written by the server are always httpOnly (not readable by page scripts), SameSite=Lax,
 * Secure in production, and scoped to the whole site. The app never uses the browser Supabase client for
 * sign-in, so nothing in the browser needs to read the session cookie.
 */
type CookieOptionsLike = {
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
};

type Hardened<T> = Omit<T, "path" | "httpOnly" | "secure" | "sameSite"> & {
  path: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
};

export function hardenCookieOptions<T extends CookieOptionsLike>(
  options: T | undefined,
  isProduction: boolean,
): Hardened<T> {
  return {
    ...(options as T),
    path: options?.path ?? "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
  };
}
