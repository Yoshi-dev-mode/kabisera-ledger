import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { NewCustomerForm } from "./new-customer-form";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const { profile } = await requirePermission("customers.manage");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] leading-8 font-medium">Add customer</h1>
        <p className="max-w-[60ch] text-[14px] text-muted-foreground">
          A contact number is optional. Never record GCash PINs, one-time codes or passwords.
        </p>
      </header>
      <section className="rounded-card bg-surface p-5">
        <NewCustomerForm isOwner={profile.role === "owner"} />
      </section>
    </div>
  );
}
