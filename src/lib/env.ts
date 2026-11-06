import { z } from "zod";

/**
 * Environment validation. Error messages name the variables that are wrong and
 * NEVER include their values (some are secrets).
 */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().min(20).optional()),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
type Source = Record<string, string | undefined>;

export class EnvError extends Error {
  readonly variables: string[];
  constructor(variables: string[]) {
    super(`Missing or invalid environment variables: ${variables.join(", ")}. See .env.example.`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

function parseWith<T extends z.ZodTypeAny>(schema: T, source: Source): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "unknown")))];
    throw new EnvError(names);
  }
  return result.data;
}

export function parsePublicEnv(source: Source): PublicEnv {
  return parseWith(publicSchema, source);
}

export function parseServerEnv(source: Source): ServerEnv {
  return parseWith(serverSchema, source);
}

/** NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline them for the browser. */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
