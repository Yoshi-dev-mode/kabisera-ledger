/**
 * Where to send someone after signing in. Only same-site paths are allowed, so a crafted
 * link such as /login?next=//evil.example cannot bounce a person to another website (open redirect).
 */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://localhost") return fallback;
  const result = `${parsed.pathname}${parsed.search}`;
  // Normalising can create a protocol-relative path (for example "/..//evil.example").
  if (result.startsWith("//")) return fallback;
  // Never send someone straight back to the sign-in or sign-out routes.
  if (parsed.pathname === "/login" || parsed.pathname.startsWith("/auth/")) return fallback;
  return result;
}
