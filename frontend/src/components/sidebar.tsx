"use client";

// Navigation: icon rail on desktop, scrollable tab bar on mobile.
// The four workflow views come first; every university fact then gets its own
// first-class tab (Facility, Map, People, Degree Map, …).

import { Zap, Brain, CalendarDays, LayoutDashboard, Cpu, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";
import { Tip } from "@/components/ui/tip";
import {
  UNIVERSITY_TABS,
  type UniversitySection,
} from "@/components/views/university-tabs";

export type ActiveView =
  | "wizard"
  | "deliverables"
  | "intelligence"
  | "schedule"
  | "solver"
  | "runtime"
  | UniversitySection;

interface NavItem {
  id: ActiveView;
  label: string;
  icon: typeof Zap;
  desc: string;
  divider?: boolean;
}

const MAIN_VIEWS: NavItem[] = [
  {
    id: "wizard",
    label: "Express",
    icon: Zap,
    desc: "Guided end-to-end workflow — Import → Intake → Build → Review → Term Change. The other rail tabs are direct workspaces for one job.",
  },
  {
    id: "deliverables",
    label: "Outputs",
    icon: LayoutDashboard,
    desc: "Per-role deliverables — proof chips, telemetry, master extract, degree map",
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    desc: "Campus calendar matrix + your published timetable",
  },
  {
    id: "intelligence",
    label: "Full",
    icon: Brain,
    desc: "Advanced — spectral radar · 4-course audit · solver · verified tightening",
  },
  {
    id: "solver",
    label: "Solver Lab",
    icon: Cpu,
    desc: "Native C-Solve engine — source, input, race and the full constraint proof",
  },
  {
    id: "runtime",
    label: "AI Runtime",
    icon: PlugZap,
    desc: "Muse Spark connection: provider, model, live test, captured verification",
  },
];

const VIEWS: NavItem[] = [
  ...MAIN_VIEWS,
  ...UNIVERSITY_TABS.map((tab, index) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    desc: tab.desc,
    divider: index === 0,
  })),
];

// Role-scoped navigation: a coordinator runs the institution, so they get the
// full toolkit. Instructors and students get exactly the two surfaces that are
// theirs — their own schedule and their role's deliverable — instead of the
// admin editors (catalog, rooms, degree maps, holidays, calendar, settings).
const ROLE_VIEWS: Record<AuthUser["role"], ActiveView[]> = {
  coordinator: VIEWS.map((view) => view.id),
  instructor: ["schedule", "deliverables"],
  student: ["schedule", "deliverables"],
};

export function viewsForRole(role: AuthUser["role"]): NavItem[] {
  const byId = new Map<ActiveView, NavItem>(VIEWS.map((view) => [view.id, view]));
  return ROLE_VIEWS[role]
    .map((id) => byId.get(id))
    .filter((view): view is NavItem => view != null);
}

export function isViewAllowed(role: AuthUser["role"], view: ActiveView): boolean {
  return ROLE_VIEWS[role].includes(view);
}

interface NavProps {
  role: AuthUser["role"];
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
}

/** Desktop / tablet: slim rail. Hidden below lg — MobileNav takes over. */
export function Sidebar({ role, activeView, setActiveView }: NavProps) {
  const views = viewsForRole(role);
  return (
    <aside className="sticky top-0 hidden h-full w-[84px] shrink-0 flex-col border-r border-border bg-card lg:flex">
      <nav
        className="custom-scrollbar flex flex-1 flex-col items-stretch gap-1 overflow-y-auto p-2"
        aria-label="Main navigation"
      >
        {views.map((view) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;
          return (
            <div key={view.id} className="w-full">
              {view.divider && <div className="my-1 border-t border-border" />}
              <Tip label={view.desc} side="right" className="w-full">
                <button
                  onClick={() => setActiveView(view.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 transition-all duration-150 active:scale-[0.97]",
                    isActive
                      ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && "scale-110")} />
                  <span className="text-[9px] leading-none font-semibold">{view.label}</span>
                </button>
              </Tip>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile: fixed bottom tab bar with safe-area padding. Hidden on lg+. */
export function MobileNav({ role, activeView, setActiveView }: NavProps) {
  const views = viewsForRole(role);
  return (
    <nav
      className="glass pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border shadow-[0_-8px_30px_rgba(15,23,42,0.06)] lg:hidden"
      aria-label="Main navigation"
    >
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 pt-1.5 pb-1.5">
        {views.map((view) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;
          return (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all duration-150 active:scale-[0.96]",
                isActive
                  ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                  : "text-muted-foreground active:bg-accent"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap text-[9px] leading-none font-semibold">{view.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
