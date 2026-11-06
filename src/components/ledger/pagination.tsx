import Link from "next/link";
import { pageInfo } from "@/lib/filters";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous / next links. `hrefFor(page)` builds a link that keeps the current filters. */
export function Pagination({ total, page, hrefFor }: { total: number; page: number; hrefFor: (page: number) => string }) {
  const info = pageInfo(total, page);
  if (total === 0) return null;
  const link = hrefFor;
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-3 text-[13px] text-muted-foreground">
      <p className="num">
        {info.firstShown}–{info.lastShown} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={link(info.current - 1)}
          aria-disabled={!info.hasPrev}
          tabIndex={info.hasPrev ? 0 : -1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), !info.hasPrev && disabled)}
        >
          Previous
        </Link>
        <span className="num">
          Page {info.current} of {info.pages}
        </span>
        <Link
          href={link(info.current + 1)}
          aria-disabled={!info.hasNext}
          tabIndex={info.hasNext ? 0 : -1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), !info.hasNext && disabled)}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
