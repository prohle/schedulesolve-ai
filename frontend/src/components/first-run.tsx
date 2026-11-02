"use client";

// Coordinator first-run checklist: import → intake → build → review → publish.
// Progress comes from the live institution state first, then from the actions
// already taken in this browser. Every row opens the exact workspace/step.

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  Database,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  clearMarks,
  getMarks,
  type FirstRunStep,
} from "@/lib/first-run";

interface OverviewShape {
  counts?: Record<string, number>;
}
interface WindowShape {
  status?: string;
  submissions?: unknown[];
}

const STEPS: {
  id: FirstRunStep;
  label: string;
  hint: string;
  path: string;
  icon: typeof Database;
}[] = [
  {
    id: "import",
    label: "Import your institution",
    hint: "Catalog, faculty, rooms and degree maps — cleaned automatically.",
    path: "/dashboard/express?step=import",
    icon: Database,
  },
  {
    id: "intake",
    label: "Collect faculty intake",
    hint: "Availability and preferences arrive before the deadline.",
    path: "/dashboard/people",
    icon: Users,
  },
  {
    id: "build",
    label: "Build a proven timetable",
    hint: "The solver places every section and checks each rule.",
    path: "/dashboard/express?step=build",
    icon: CalendarCheck2,
  },
  {
    id: "review",
    label: "Review coverage and fairness",
    hint: "See on-time coverage, workload and the proof behind it.",
    path: "/dashboard/express?step=review",
    icon: ShieldCheck,
  },
  {
    id: "publish",
    label: "Publish to every role",
    hint: "Instructors and students see only their own timetable.",
    path: "/dashboard/schedule",
    icon: ListChecks,
  },
];

export function FirstRunChecklist({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [done, setDone] = useState<Partial<Record<FirstRunStep, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    const marks = getMarks();
    const next: Partial<Record<FirstRunStep, boolean>> = { ...marks };
    try {
      const [overviewRes, windowRes, scheduleRes] = await Promise.all([
        authFetch("/api/institution/overview"),
        authFetch("/api/term/window"),
        authFetch("/api/schedule/current"),
      ]);
      if (overviewRes.ok) {
        const overview = (await overviewRes.json()) as OverviewShape;
        const counts = overview.counts ?? {};
        if ((counts.courses ?? 0) > 0 && (counts.faculty ?? 0) > 0) next.import = true;
      }
      if (windowRes.ok) {
        const window = (await windowRes.json()) as WindowShape;
        if ((window.submissions?.length ?? 0) > 0) next.intake = true;
      }
      if (scheduleRes.ok) {
        next.build = true;
        next.review = true;
        next.publish = true;
      }
    } catch {
      /* the checklist still renders from local marks */
    }
    setDone(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Mount fetch: state writes happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const completed = STEPS.filter((step) => done[step.id]).length;
  const nextStep = STEPS.find((step) => !done[step.id]) ?? null;
  const pct = Math.round((completed / STEPS.length) * 100);

  return (
    <section
      aria-labelledby="first-run-title"
      className="mb-3 overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-card to-violet-50/50 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ListChecks className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p id="first-run-title" className="text-sm font-extrabold tracking-tight">
              First term setup
            </p>
            <p className="text-xs text-muted-foreground">
              {completed} of {STEPS.length} steps complete · sample institution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-blue-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="First-run progress"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button
            onClick={() => void load()}
            aria-label="Refresh checklist"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Hide checklist"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-blue-100/80 px-3 py-2.5">
          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isDone = Boolean(done[step.id]);
              const isNext = nextStep?.id === step.id;
              return (
                <li key={step.id}>
                  <button
                    onClick={() => onNavigate(step.path)}
                    className={cn(
                      "flex h-full w-full items-start gap-2 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                      isDone
                        ? "border-emerald-200 bg-emerald-50/70"
                        : isNext
                          ? "border-primary/40 bg-card ring-1 ring-primary/20"
                          : "border-border bg-card/80"
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      isDone ? "text-emerald-600" : isNext ? "text-primary" : "text-muted-foreground"
                    )}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Step {index + 1}
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="block text-xs font-bold leading-tight text-foreground">{step.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{step.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {nextStep ? `Next: ${nextStep.label}` : "Every step is complete — the term is live for all roles."}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { clearMarks(); void load(); }}
                className="text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Reset progress
              </button>
              {nextStep && (
                <button
                  onClick={() => onNavigate(nextStep.path)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-95"
                >
                  {nextStep.label} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
