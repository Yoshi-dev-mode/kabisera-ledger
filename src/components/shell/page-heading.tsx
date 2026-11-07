import type { NavIcon } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIconView } from "./nav-icons";

export function PageHeading({ icon, children, className }: {
  icon: NavIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1 className={cn("flex items-center gap-2.5 text-[24px] leading-8 font-medium", className)}>
      <NavIconView name={icon} className="size-5 shrink-0 text-primary" />
      <span>{children}</span>
    </h1>
  );
}
