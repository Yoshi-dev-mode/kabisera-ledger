import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { fetchCustomer } from "@/lib/data/queries";
import { isUuid } from "@/lib/uuid";
import { EditCustomerForm } from "./edit-customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  await requirePermission("customers.manage");
  const customer = await fetchCustomer(customerId);
  if (!customer) notFound();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] leading-8 font-medium">Edit {customer.displayName}</h1>
        <Link href={`/customers/${customer.id}`} className="text-[13px] underline underline-offset-4">Back to the profile</Link>
      </header>
      <section className="rounded-card bg-surface p-5">
        <EditCustomerForm id={customer.id} displayName={customer.displayName} contactNumber={customer.contactNumber} notes={customer.notes} />
      </section>
    </div>
  );
}
