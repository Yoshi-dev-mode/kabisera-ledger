import { cn } from "@/lib/utils";

type Tone = "positive" | "negative" | "warning" | "neutral";

/** Status chip: 20px tall, 4px radius, soft tint with dark ink. Never colour alone: always carries text. */
export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center rounded-chip px-1.5 text-[12px] leading-4 whitespace-nowrap", className)}
      style={{ background: `var(--pill-${tone}-bg)`, color: `var(--pill-${tone}-ink)` }}
    >
      {children}
    </span>
  );
}
