import { formatPesos } from "@/lib/money";
import { cn } from "@/lib/utils";

/** An amount in pesos with tabular digits. Use `signed` for movements (+ in, − out). */
export function Money({ cents, signed = false, className }: { cents: number; signed?: boolean; className?: string }) {
  return <span className={cn("num", className)}>{formatPesos(cents, { signed })}</span>;
}
