"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Ellipsis, LogOut, X } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIconView } from "./nav-icons";

type Props = {
  bar: readonly NavItem[];
  more: readonly NavItem[];
  displayName: string;
  roleLabel: string;
};

/**
 * Phone navigation: a bottom bar with the main destinations plus a "More" sheet holding the rest and sign-out.
 * The sheet is a native <dialog>, so focus is trapped and Escape closes it without extra libraries.
 */
export function MobileNav({ bar, more, displayName, roleLabel }: Props) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Close the sheet whenever the page changes.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const cell = "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] leading-4";

  return (
    <>
      <nav
        aria-label="Main"
        data-tour="main-nav"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {bar.map((item) =>
          item.available ? (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(cell, active(item.href) ? "font-medium text-foreground" : "text-muted-foreground")}
            >
              <NavIconView name={item.icon} className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          ) : (
            <span key={item.href} aria-disabled="true" className={cn(cell, "text-muted-foreground")}>
              <NavIconView name={item.icon} className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </span>
          ),
        )}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className={cn(cell, "text-muted-foreground")}
        >
          <Ellipsis className="size-5" strokeWidth={1.5} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <dialog
        ref={dialogRef}
        aria-label="More"
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-card bg-surface p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-[16px] font-medium">More</p>
          <Button type="button" variant="ghost" size="icon" onClick={() => dialogRef.current?.close()} aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ul className="flex flex-col px-2 py-2">
          {more.map((item) => (
            <li key={item.href}>
              {item.available ? (
                <Link href={item.href} className="flex h-11 items-center gap-3 rounded-control px-3 text-[14px]">
                  <NavIconView name={item.icon} className="size-4" />
                  {item.label}
                </Link>
              ) : (
                <span aria-disabled="true" className="flex h-11 items-center gap-3 px-3 text-[14px] text-muted-foreground">
                  <NavIconView name={item.icon} className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[12px]">Phase {item.phase}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0">
            <p className="truncate text-[14px]">{displayName}</p>
            <p className="text-[12px] text-muted-foreground">{roleLabel}</p>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </dialog>
    </>
  );
}
