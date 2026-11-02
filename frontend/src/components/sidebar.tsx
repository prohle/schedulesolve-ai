"use client";

// Navigation: icon rail on desktop, scrollable tab bar on mobile.
// The four workflow views come first; every university fact then gets its own
// first-class tab (Facility, Map, People, Degree Map, …).

import { useEffect, useState } from "react";
import { Zap, Brain, CalendarDays, LayoutDashboard, Cpu, PlugZap, ChevronsLeft, ChevronsRight, MoreHorizontal, X } from "lucide-react";
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

type NavGroup = "flow" | "workspaces" | "institution";

interface NavItem {
  id: ActiveView;
  label: string;
  icon: typeof Zap;
  desc: string;
  group: NavGroup;
}

const GROUP_LABELS: Record<NavGroup, string> = {
  flow: "Guided",
  workspaces: "Workspaces",
  institution: "Institution",
};

const MAIN_VIEWS: NavItem[] = [
  {
    id: "wizard",
    label: "Express",
    icon: Zap,
    desc: "Guided end-to-end workflow — Import → Intake → Build → Review → Term Change. The other rail tabs are direct workspaces for one job.",
    group: "flow",
  },
  {
    id: "deliverables",
    label: "Outputs",
    icon: LayoutDashboard,
    desc: "Per-role deliverables — proof chips, telemetry, master extract, degree map",
    group: "workspaces",
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    desc: "Campus calendar matrix + your published timetable",
    group: "workspaces",
  },
  {
    id: "intelligence",
    label: "Full",
    icon: Brain,
    desc: "Advanced — spectral radar · 4-course audit · solver · verified tightening",
    group: "workspaces",
  },
  {
    id: "solver",
    label: "Solver Lab",
    icon: Cpu,
    desc: "Native C-Solve engine — source, input, race and the full constraint proof",
    group: "workspaces",
  },
  {
    id: "runtime",
    label: "AI Runtime",
    icon: PlugZap,
    desc: "Muse Spark connection: provider, model, live test, captured verification",
    group: "workspaces",
  },
];

const VIEWS: NavItem[] = [
  ...MAIN_VIEWS,
  ...UNIVERSITY_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    desc: tab.desc,
    group: "institution" as const,
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

/** Desktop / tablet: collapsible rail. Hidden below lg — MobileNav takes over. */
export function Sidebar({ role, activeView, setActiveView }: NavProps) {
  const views = viewsForRole(role);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem("schedulesolve.sidebar") === "0") setExpanded(false);
  }, []);

  function toggle() {
    setExpanded((value) => {
      window.localStorage.setItem("schedulesolve.sidebar", value ? "0" : "1");
      return !value;
    });
  }

  return (
    <aside className={cn(
      "sticky top-0 hidden h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex",
      expanded ? "w-[232px]" : "w-[84px]",
    )}>
      <div className={cn("flex items-center border-b border-border p-2", expanded ? "justify-between" : "justify-center")}>
        {expanded && (
          <span className="px-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
            Navigation
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {expanded ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </button>
      </div>
      <nav
        className="custom-scrollbar flex flex-1 flex-col items-stretch gap-1 overflow-y-auto p-2"
        aria-label="Main navigation"
      >
        {views.map((view, index) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;
          const groupStart = index === 0 || views[index - 1].group !== view.group;
          return (
            <div key={view.id} className="w-full">
              {groupStart && (
                <div className={cn(
                  "font-black uppercase tracking-[0.14em] text-muted-foreground/45",
                  expanded
                    ? "px-2 pb-0.5 text-left text-[9px]"
                    : "px-1 text-center text-[7px]",
                  index > 0 && "pt-2",
                )}>
                  {GROUP_LABELS[view.group]}
                </div>
              )}
              <Tip label={view.desc} side="right" className="w-full">
                <button
                  onClick={() => setActiveView(view.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex w-full items-center rounded-xl transition-all duration-150 active:scale-[0.98]",
                    expanded
                      ? "min-h-10 justify-start gap-2.5 px-2.5 py-1.5"
                      : "min-h-12 flex-col justify-center gap-1 px-1 py-1.5",
                    isActive
                      ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && "scale-110")} />
                  <span className={cn(
                    "leading-none font-semibold",
                    expanded ? "truncate text-[11px]" : "text-[9px]",
                  )}>
                    {view.label}
                  </span>
                </button>
              </Tip>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile: primary tabs + a grouped "More" sheet for the admin rail. */
export function MobileNav({ role, activeView, setActiveView }: NavProps) {
  const views = viewsForRole(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryIds = role === "coordinator"
    ? ["wizard", "deliverables", "schedule"]
    : ["schedule", "deliverables"];
  const primary = views.filter((view) => primaryIds.includes(view.id));
  const overflow = views.filter((view) => !primaryIds.includes(view.id));
  const activeInOverflow = overflow.some((view) => view.id === activeView);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="pb-safe absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">All tools</p>
                <p className="text-sm font-extrabold tracking-tight">Institution & workspaces</p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(["workspaces", "institution"] as const).map((group) => {
              const groupViews = overflow.filter((view) => view.group === group);
              if (groupViews.length === 0) return null;
              return (
                <div key={group} className="mb-3">
                  <div className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/50">
                    {GROUP_LABELS[group]}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {groupViews.map((view) => {
                      const Icon = view.icon;
                      const isActive = activeView === view.id;
                      return (
                        <button
                          key={view.id}
                          onClick={() => { setActiveView(view.id); setMoreOpen(false); }}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-left text-[11px] font-bold transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/60 text-slate-700 hover:bg-accent"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{view.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <nav
        className="glass pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border shadow-[0_-8px_30px_rgba(15,23,42,0.06)] lg:hidden"
        aria-label="Main navigation"
      >
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 pt-1.5 pb-1.5">
          {primary.map((view) => {
            const Icon = view.icon;
            const isActive = activeView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-12 min-w-[64px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all duration-150 active:scale-[0.96]",
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
          {overflow.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                "flex min-h-12 min-w-[64px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all duration-150 active:scale-[0.96]",
                activeInOverflow
                  ? "brand-gradient text-white shadow-lg shadow-blue-500/30"
                  : "text-muted-foreground active:bg-accent"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="whitespace-nowrap text-[9px] leading-none font-semibold">More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
