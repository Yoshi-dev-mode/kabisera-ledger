/**
 * Password rules for staff accounts. Length matters more than complexity, so there is no
 * "must contain a symbol" rule; instead we block the obvious: too short, too common, sequences,
 * repeated characters and passwords built from the person's own email.
 * The upper limit is 72 BYTES because the password hash used by Supabase Auth ignores anything beyond that.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

const COMMON = new Set([
  "password1234", "passwordpassword", "123456789012", "1234567890123", "qwertyuiop12",
  "qwertyuiopas", "iloveyou1234", "welcome12345", "admin1234567", "letmein12345",
  "kabisera1234", "kabiseraledger", "gcashgcash12", "philippines1",
]);

function isSequential(text: string): boolean {
  if (text.length < 2) return false;
  let step = 0;
  for (let i = 1; i < text.length; i++) {
    const diff = text.charCodeAt(i) - text.charCodeAt(i - 1);
    if (diff !== 1 && diff !== -1) return false;
    if (i === 1) step = diff;
    else if (diff !== step) return false;
  }
  return true;
}

export function passwordProblems(password: string, context: { email?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    problems.push(`Use at most ${PASSWORD_MAX_BYTES} characters.`);
  }
  if (password.length > 0 && new Set(password).size === 1) {
    problems.push("Do not repeat a single character.");
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || isSequential(lower)) {
    problems.push("That password is too easy to guess.");
  }
  const email = context.email?.trim().toLowerCase();
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (lower === email || (local.length >= 4 && lower.includes(local))) {
      problems.push("Do not use your email address in the password.");
    }
  }
  return problems;
}

export function isAcceptablePassword(password: string, context: { email?: string } = {}): boolean {
  return passwordProblems(password, context).length === 0;
}
