import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ChangePasswordPage() {
  const { profile } = await requireSession({ allowMustChangePassword: true });
  if (!profile.mustChangePassword) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">Kabisera Ledger</p>
        <h1 className="text-[24px] leading-8 font-medium">Choose a new password</h1>
        <p className="text-[14px] text-muted-foreground">
          Hi {profile.displayName}. The owner set a temporary password for you. Choose your own now; nobody else
          will know it.
        </p>
      </div>
      <div className="rounded-card bg-surface p-5">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
