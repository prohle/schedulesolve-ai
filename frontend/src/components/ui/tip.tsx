"use client";

// Tooltip primitives — explanations live here, not on screen.
// Desktop: reveals on hover. Mobile/keyboard: reveals on tap/focus
// (focus-within), so no copy is lost, just hidden until asked for.

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

const POS: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2 origin-bottom",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2 origin-top",
  right: "left-full top-1/2 -translate-y-1/2 ml-2 origin-left",
  left: "right-full top-1/2 -translate-y-1/2 mr-2 origin-right",
};

export function Tip({
  label,
  children,
  side = "top",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[70] w-max max-w-[min(248px,72vw)] rounded-xl bg-slate-900/95 px-3 py-2",
          "text-left text-xs font-normal leading-snug text-white shadow-2xl ring-1 ring-white/10 backdrop-blur",
          "invisible scale-95 opacity-0 transition-all duration-150",
          "group-hover/tip:visible group-hover/tip:scale-100 group-hover/tip:opacity-100",
          "group-focus-within/tip:visible group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100",
          POS[side]
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** Small ⓘ affordance carrying one hidden explanation. */
export function InfoTip({ text, className }: { text: ReactNode; className?: string }) {
  return (
    <Tip label={text} className={className}>
      <span
        tabIndex={0}
        aria-label={typeof text === "string" ? text : "More info"}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="h-3.5 w-3.5" />
      </span>
    </Tip>
  );
}
