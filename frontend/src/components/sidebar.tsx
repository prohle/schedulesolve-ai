"use client";

// Navigation: icon rail on desktop, tab bar on mobile.
// One-line labels stay visible; full descriptions hide in hover/tap tooltips.

import { Zap, Brain, CalendarClock, CalendarDays, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tip";

export type ActiveView = "setup" | "wizard" | "deliverables" | "intelligence" | "schedule";

const VIEWS = [
  {
    id: "setup" as const,
    label: "University",
    icon: CalendarClock,
    desc: "Facility · Map · People · Degree Map · Catalog · Students · Holidays · Weeks · Calendar · Settings",
  },
  {
    id: "wizard" as const,
    label: "Express",
    icon: Zap,
    desc: "Guided — step by step: Import → Intake → Build → Review → Term Change",
  },
  {
    id: "deliverables" as const,
    label: "Outputs",
    icon: LayoutDashboard,
    desc: "Per-role deliverables — proof chips, telemetry, master extract, degree map",
  },
  {
    id: "schedule" as const,
    label: "Schedule",
    icon: CalendarDays,
    desc: "Your published timetable (per role) + change requests",
  },
  {
    id: "intelligence" as const,
    label: "Full",
    icon: Brain,
    desc: "Advanced — spectral radar · 4-course audit · solver · verified tightening",
  },
];

interface NavProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
}

/** Desktop / tablet: slim rail. Hidden below lg — MobileNav takes over. */
export function Sidebar({ activeView, setActiveView }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-full w-[84px] shrink-0 flex-col border-r border-border bg-card lg:flex">
      <nav
        className="flex flex-1 flex-col items-stretch gap-1 p-2"
        aria-label="Main navigation"
      >
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;
          return (
            <Tip key={view.id} label={view.desc} side="right" className="w-full">
              <button
                onClick={() => setActiveView(view.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 transition-all duration-150 active:scale-[0.97]",
                  isActive
                    ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive && "scale-110")} />
                <span className="text-[10px] leading-none font-semibold">{view.label}</span>
              </button>
            </Tip>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile: fixed bottom tab bar with safe-area padding. Hidden on lg+. */
export function MobileNav({ activeView, setActiveView }: NavProps) {
  return (
    <nav
      className="glass pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border shadow-[0_-8px_30px_rgba(15,23,42,0.06)] lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5 pb-1.5">
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;
          return (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all duration-150 active:scale-[0.96]",
                isActive
                  ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                  : "text-muted-foreground active:bg-accent"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-none font-semibold">{view.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
