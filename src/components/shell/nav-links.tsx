"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIconView } from "./nav-icons";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Grouped, labelled navigation. Screens that are not built yet are shown disabled with the phase that delivers them. */
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      {NAV_GROUPS.map((group, index) => {
        const groupItems = items.filter((item) => item.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <section key={group.id} aria-label={group.label} className={cn(index === 0 ? "" : "mt-6")}>
            <h2 className="px-3 pb-1 text-[12px] font-normal text-muted-foreground">{group.label}</h2>
            <ul className="flex flex-col gap-[2px]">
              {groupItems.map((item) => {
                const rowClass =
                  "flex h-8 items-center gap-2.5 rounded-control px-3 text-[14px] leading-5";
                if (!item.available) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        title={`Arrives in Phase ${item.phase}`}
                        className={cn(rowClass, "cursor-default text-muted-foreground")}
                      >
                        <NavIconView name={item.icon} className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="text-[12px]">Phase {item.phase}</span>
                      </span>
                    </li>
                  );
                }
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(rowClass, "transition-colors", active ? "bg-secondary font-medium text-primary" : "hover:bg-muted")}
                    >
                      <NavIconView name={item.icon} className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
