import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { TourGuide } from "@/components/shell/tour-guide";
import { requireSession } from "@/lib/auth/session";
import { splitForMobile, visibleNavItems } from "@/lib/nav";

/**
 * Every page inside (app) is protected: requireSession() redirects signed-out, deactivated and
 * must-change-password users before anything renders. Each page then checks its own permission as well.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const items = visibleNavItems(profile);
  const { bar, more } = splitForMobile(items);

  return (
    <div className="lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar items={items} profile={profile} />
      <main id="main" className="min-w-0 flex-1 px-4 pt-6 pb-24 lg:px-10 lg:pt-9 lg:pb-10">
        <div className="mx-auto w-full max-w-300">{children}</div>
      </main>
      <MobileNav
        bar={bar}
        more={more}
        displayName={profile.displayName}
        roleLabel={profile.role === "owner" ? "Owner" : "Staff"}
      />
      <TourGuide />
    </div>
  );
}
