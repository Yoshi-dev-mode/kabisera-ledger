"use client";

import { Button } from "@/components/ui/button";

/** Shown when a page fails to load. Never shows technical details; they are logged on the server. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex max-w-[60ch] flex-col gap-3" role="alert">
      <h1 className="text-[24px] leading-8 font-medium">Something went wrong</h1>
      <p className="text-[14px] text-muted-foreground">This page could not be loaded. Nothing was changed. Try again, and if it keeps happening, tell the owner.</p>
      <div><Button type="button" variant="outline" onClick={() => reset()}>Try again</Button></div>
    </div>
  );
}
