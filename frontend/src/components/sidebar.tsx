"use client";

// Navigation: icon rail on desktop, scrollable tab bar on mobile.
// The guided workflow comes first; every university fact then gets its own
// first-class tab (Facility, Map, People, Degree Map, …).

import { useEffect, useRef, useState } from "react";
import {
  Zap,
  Brain,
  CalendarDays,
  LayoutDashboard,
  Cpu,
  PlugZap,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
  X,
} from "lucide-react";
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

// Labels lead with the outcome. Solver vocabulary (CP-SAT, C39, spectral)
// lives in the description/tooltip, one layer down.
const MAIN_VIEWS: NavItem[] = [
  {
    id: "wizard",
    label: "Guided build",
    icon: Zap,
    desc: "Import → Intake → Build → Review → Term change, in one guided path.",
    group: "flow",
  },
  {
    id: "deliverables",
    label: "Deliverables",
    icon: LayoutDashboard,
    desc: "What each role receives — proof, workload, degree progress and the master extract.",
    group: "workspaces",
  },
  {
    id: "schedule",
    label: "Timetable",
    icon: CalendarDays,
    desc: "The published campus timetable and your own teaching or cohort schedule.",
    group: "workspaces",
  },
  {
    id: "intelligence",
    label: "Insights",
    icon: Brain,
    desc: "Coverage, fairness and risk — with the advanced solver evidence one layer down.",
    group: "workspaces",
  },
  {
    id: "solver",
    label: "Proof Lab",
    icon: Cpu,
    desc: "Speed and evidence: the native engine races CP-SAT and every rule is re-verified.",
    group: "workspaces",
  },
  {
    id: "runtime",
    label: "AI Connection",
    icon: PlugZap,
    desc: "The live Muse Spark connection, model and structured-output verification.",
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

// Human-readable URL slugs. The internal ids stay stable for code and APIs;
// the address bar reads like the product: /dashboard/express, /insights, /ai.
const VIEW_SLUGS: Partial<Record<ActiveView, string>> = {
  wizard: "express",
  intelligence: "insights",
  runtime: "ai",
};

/** URL-safe path segment for a workspace. */
export function viewPath(view: ActiveView): string {
  return `/dashboard/${VIEW_SLUGS[view] ?? view}`;
}

/** Parse a pathname segment back into a known workspace. */
export function viewFromPath(segment: string | undefined): ActiveView | null {
  if (!segment) return null;
  const match = VIEWS.find((view) => (VIEW_SLUGS[view.id] ?? view.id) === segment);
  return match ? match.id : null;
}

/** The workspace a role lands on when no path is given. */
export function homeView(role: AuthUser["role"]): ActiveView {
  return role === "coordinator" ? "wizard" : "schedule";
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
    // Hydration-safe: the server always renders the expanded rail, then the
    // stored preference applies on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      expanded ? "w-[236px]" : "w-[88px]",
    )}>
      <div className={cn("flex items-center border-b border-border p-2", expanded ? "justify-between" : "justify-center")}>
        {expanded && (
          <span className="px-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Navigation
          </span>
        )}
        <button
          onClick={toggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                  "font-black uppercase tracking-[0.14em] text-muted-foreground",
                  expanded
                    ? "px-2 pb-0.5 text-left text-xs"
                    : "px-1 text-center text-xs",
                  index > 0 && "pt-2",
                )}>
                  {GROUP_LABELS[view.group]}
                </div>
              )}
              <Tip label={view.desc} side="right" className="w-full">
                <button
                  onClick={() => setActiveView(view.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={view.label}
                  title={expanded ? undefined : view.label}
                  className={cn(
                    "relative flex w-full items-center rounded-xl transition-all duration-150 active:scale-[0.98]",
                    expanded
                      ? "min-h-10 justify-start gap-2.5 px-2.5 py-1.5"
                      : "min-h-12 flex-col justify-center gap-1 px-1 py-1.5",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive && "scale-110")} />
                  <span className={cn(
                    "leading-none font-semibold",
                    expanded ? "truncate text-xs" : "text-xs",
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const primaryIds = role === "coordinator"
    ? ["wizard", "deliverables", "schedule"]
    : ["schedule", "deliverables"];
  const primary = views.filter((view) => primaryIds.includes(view.id));
  const overflow = views.filter((view) => !primaryIds.includes(view.id));
  const activeInOverflow = overflow.some((view) => view.id === activeView);

  function openMore() {
    restoreRef.current =
      moreButtonRef.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setMoreOpen(true);
  }

  function closeMore() {
    setMoreOpen(false);
  }

  // Focus trap + Escape + focus return for the "More" sheet.
  useEffect(() => {
    if (!moreOpen) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const focusables = () =>
      Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
    focusables()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) restoreRef.current?.focus?.();
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={closeMore}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="more-sheet-title"
            className="pb-safe absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">All tools</p>
                <p id="more-sheet-title" className="text-sm font-extrabold tracking-tight">Institution &amp; workspaces</p>
              </div>
              <button
                onClick={closeMore}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(["workspaces", "institution"] as const).map((group) => {
              const groupViews = overflow.filter((view) => view.group === group);
              if (groupViews.length === 0) return null;
              return (
                <div key={group} className="mb-3">
                  <div className="mb-1 px-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {groupViews.map((view) => {
                      const Icon = view.icon;
                      const isActive = activeView === view.id;
                      return (
                        <button
                          key={view.id}
                          onClick={() => { setActiveView(view.id); closeMore(); }}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-2 rounded-xl px-2.5 text-left text-xs font-bold transition-colors",
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
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground active:bg-accent"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="whitespace-nowrap text-xs leading-none font-semibold">{view.label}</span>
              </button>
            );
          })}
          {overflow.length > 0 && (
            <button
              ref={moreButtonRef}
              onClick={openMore}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              aria-label="More workspaces"
              className={cn(
                "flex min-h-12 min-w-[64px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all duration-150 active:scale-[0.96]",
                activeInOverflow
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "text-muted-foreground active:bg-accent"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="whitespace-nowrap text-xs leading-none font-semibold">More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
