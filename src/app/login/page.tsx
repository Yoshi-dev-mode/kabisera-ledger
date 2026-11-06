import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const REASONS: Record<string, string> = {
  "no-access": "That account has no access. Ask the owner to set it up or re-enable it.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const notice = params.reason ? REASONS[params.reason] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">Kabisera Ledger</p>
        <h1 className="text-[24px] leading-8 font-medium">Sign in</h1>
      </div>
      {notice ? (
        <p role="status" className="rounded-control bg-[var(--pill-warning-bg)] px-3 py-2 text-[13px] text-[var(--pill-warning-ink)]">
          {notice}
        </p>
      ) : null}
      <div className="rounded-card bg-surface p-5">
        <LoginForm next={next} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        Independent recordkeeping tool. Not an official GCash product. Staff accounts are created by the owner.
      </p>
    </main>
  );
}
