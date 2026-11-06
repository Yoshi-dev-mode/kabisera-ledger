import {
  BarChart3,
  HandCoins,
  LayoutDashboard,
  List,
  ListChecks,
  Plus,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  plus: Plus,
  list: List,
  users: Users,
  debt: HandCoins,
  wallet: Wallet,
  check: ListChecks,
  chart: BarChart3,
  staff: UserCog,
  settings: Settings,
};

export function NavIconView({ name, className }: { name: NavIcon; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={1.5} aria-hidden="true" />;
}
