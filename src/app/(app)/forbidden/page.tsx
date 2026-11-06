import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "No access" };

export default async function ForbiddenPage() {
  await requireSession();
  return (
    <div className="flex max-w-[60ch] flex-col gap-3">
      <h1 className="text-[24px] leading-8 font-medium">You don&rsquo;t have access to this page</h1>
      <p className="text-[14px] text-muted-foreground">
        Your account is not allowed to open it. If you need it for your work, ask the owner to update your
        access.
      </p>
      <p>
        <Link href="/dashboard" className="text-[14px] underline underline-offset-4">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
