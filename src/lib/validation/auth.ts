import { z } from "zod";
import { isPermission, parsePermissions, type Permission } from "@/lib/auth/permissions";
import { passwordProblems } from "@/lib/auth/password";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const displayName = z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer.");

const permissions = z
  .array(z.string())
  .max(30)
  .refine((items) => items.every(isPermission), "Unknown permission.")
  .transform((items): Permission[] => parsePermissions(items));

function checkPassword(password: string, ctx: z.RefinementCtx, emailAddress?: string) {
  const problems = passwordProblems(password, { email: emailAddress });
  for (const message of problems) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["password"] });
  }
}

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const staffCreateSchema = z
  .object({ displayName, email, password: z.string().max(200), permissions })
  .superRefine((value, ctx) => checkPassword(value.password, ctx, value.email));

export const staffUpdateSchema = z.object({
  userId: z.string().uuid(),
  displayName,
  isActive: z.boolean(),
  permissions,
});

export function makeChangePasswordSchema(emailAddress?: string) {
  return z
    .object({ password: z.string().max(200), confirm: z.string().max(200) })
    .superRefine((value, ctx) => {
      checkPassword(value.password, ctx, emailAddress);
      if (value.password !== value.confirm) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The two passwords do not match.", path: ["confirm"] });
      }
    });
}
