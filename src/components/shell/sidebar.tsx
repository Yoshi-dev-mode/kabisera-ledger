import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/auth/permissions";
import type { NavItem } from "@/lib/nav";
import { NavLinks } from "./nav-links";

/** Desktop shell: labelled sidebar on the page ground ("open plane"), user row at the bottom. */
export function Sidebar({ items, profile }: { items: readonly NavItem[]; profile: Profile }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[256px] shrink-0 flex-col px-3 py-5 lg:flex">
      <div className="px-3 pb-6">
        <p className="text-[14px] leading-5 font-medium">Kabisera Ledger</p>
        <p className="text-[12px] text-muted-foreground">Cash, GCash and load ledger</p>
      </div>
      <nav aria-label="Main" data-tour="main-nav" className="flex-1 overflow-y-auto">
        <NavLinks items={items} />
      </nav>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border px-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-[14px] leading-5">{profile.displayName}</p>
          <p className="text-[12px] text-muted-foreground">{profile.role === "owner" ? "Owner" : "Staff"}</p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
