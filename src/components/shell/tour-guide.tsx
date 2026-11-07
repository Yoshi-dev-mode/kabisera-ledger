"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    selector: '[data-tour="main-nav"]',
    title: "Find your way around",
    description: "Use the navigation to move between your dashboard, transactions, customers, balances and reports. On a phone, open More for the rest.",
  },
  {
    selector: "#main h1",
    title: "Know which page you’re on",
    description: "The page heading tells you where you are. Use the actions beside or below it to record something or narrow the information shown.",
  },
  {
    selector: "#main section",
    title: "Review before you save",
    description: "Cards group related figures and forms. Transaction forms show a preview of how an entry will affect your balances before you record it.",
  },
];

export function TourGuide() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const visibleTarget = Array.from(document.querySelectorAll<HTMLElement>(steps[stepIndex]!.selector))
      .find((element) => element.getClientRects().length > 0);
    visibleTarget?.classList.add("tour-highlight");
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      visibleTarget?.classList.remove("tour-highlight");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, stepIndex]);

  function finish() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        data-noprint
        aria-label="Take a guided tour"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-30 rounded-full border-primary/20 bg-surface text-primary shadow-sm lg:right-6 lg:bottom-6"
        onClick={() => { setStepIndex(0); setOpen(true); }}
      >
        <HelpCircle aria-hidden="true" />
        Guide
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/35" aria-hidden="true" />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-description"
            className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-lg rounded-card border border-border bg-surface p-5 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-primary">Quick tour · {stepIndex + 1} of {steps.length}</p>
                <h2 id="tour-title" className="mt-2 text-[18px] leading-6 font-semibold">{steps[stepIndex]!.title}</h2>
              </div>
              <Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label="Close tour" onClick={finish}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <p id="tour-description" className="mt-2 text-[14px] leading-6 text-muted-foreground">{steps[stepIndex]!.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" className="text-[13px] text-muted-foreground underline underline-offset-4" onClick={finish}>Skip tour</button>
              <div className="flex gap-2">
                {stepIndex > 0 ? <Button type="button" variant="outline" onClick={() => setStepIndex((i) => i - 1)}>Back</Button> : null}
                <Button type="button" onClick={() => stepIndex === steps.length - 1 ? finish() : setStepIndex((i) => i + 1)}>
                  {stepIndex === steps.length - 1 ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
