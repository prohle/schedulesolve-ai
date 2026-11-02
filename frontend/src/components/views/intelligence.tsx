"use client";

// VIEW: Intelligence — the live backend bridge. Spectral radar over the
// section-conflict graph, the C39 four-course guarantee audit, real CP-SAT
// solve, and Muse-proposed / CP-SAT-verified tightening moves. Every number
// here comes from the Python backend, not the in-browser toy solver.

import { Fragment, useState, type ReactNode } from "react";
import {
  Radar, ShieldCheck, Sparkles, GitFork, Activity, Wrench,
  CircleCheck, CircleX, Loader2, Database, Network, RefreshCw, Gauge, Building2, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/tip";
import { TimetableGrid } from "@/components/timetable-grid";
import { useAudit, useIntelligence } from "@/hooks/use-api";
import { authFetch } from "@/lib/auth";
import {
  DAY_NAMES, PERIOD_NAMES, PATTERN_DAYS,
  type Placement, type SparseMatrixPayload, type SolveResult, type WhatIfReport,
} from "@/types";

interface IntelligenceViewProps {
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

function Card({ title, icon, hint, children, className }: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      <header className="flex items-center gap-2 border-b border-border px-3.5 py-2.5 sm:px-4">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{title}</h3>
        {hint && <InfoTip text={hint} />}
      </header>
      <div className="p-3.5 sm:p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-muted/40 p-3">
      <div className="truncate text-xl font-extrabold text-foreground sm:text-2xl">{value}</div>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        {hint && <InfoTip text={hint} />}
      </div>
    </div>
  );
}

function placementSlot(p: Placement): string {
  if (p.period != null) {
    const pattern = PATTERN_DAYS.MWF.includes(p.days[0]) && p.days.length === 3 ? "MWF" : "TTh";
    return `${pattern} @${PERIOD_NAMES[p.period]}`;
  }
  const day = DAY_NAMES[p.days[0]]?.slice(0, 3) ?? "?";
  return `${day} @${PERIOD_NAMES[p.periods[0]]}-${PERIOD_NAMES[p.periods[1] ?? p.periods[0]]}`;
}

const MATRIX_ROWS: [string, keyof ReturnType<typeof Object>][] = [];

export function IntelligenceView({ onToast }: IntelligenceViewProps) {
  const { matrices, spectral, margins, utilization, solveResult, setSolveResult, tighten, loading, busy, error, runSolve, runTighten, reload } = useIntelligence();
  const { history, loading: auditLoading, reload: reloadAudit } = useAudit();
  const [tab, setTab] = useState<"radar" | "margins" | "matrices" | "utilization" | "solve" | "tighten" | "planning" | "audit">("radar");
  const [options, setOptions] = useState<SolveResult[] | null>(null);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [busyOptions, setBusyOptions] = useState(false);
  const [whatif, setWhatif] = useState<WhatIfReport | null>(null);
  const [whatifBusy, setWhatifBusy] = useState(false);
  const [applyingMove, setApplyingMove] = useState<number | null>(null);
  const [appliedMove, setAppliedMove] = useState<number | null>(null);

  const applyMove = async (idx: number) => {
    if (!tighten) return;
    const move = tighten.moves[idx];
    setApplyingMove(idx);
    try {
      const res = await authFetch("/api/intelligence/tighten/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "This repair could not be applied");
      setAppliedMove(idx);
      onToast(data.applied ? "Elected repair re-verified and applied" : data.note ?? "Election recorded", "success");
      await reload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Sign in as the coordinator to apply a repair", "error");
    } finally { setApplyingMove(null); }
  };

  const runWhatif = async (changeId: string) => {
    setWhatifBusy(true);
    try {
      setWhatif(await (await fetch(`/api/planning/whatif/${changeId}`)).json());
    } finally {
      setWhatifBusy(false);
    }
  };

  const runOptions = async () => {
    setBusyOptions(true);
    try {
      const res = await fetch("/api/schedule/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setOptions(await res.json());
      onToast("3 schedule options generated", "success");
    } finally {
      setBusyOptions(false);
    }
  };

  const runPin = async () => {
    const placements = solveResult?.timetable?.placements ?? [];
    const pins: Record<string, Record<string, unknown>> = {};
    placements.forEach((p) => {
      if (locked[p.section_id]) {
        pins[p.section_id] = { instructor_id: p.instructor_id, room_id: p.room_id, period: p.period, day: p.days[0] };
      }
    });
    const res = await fetch("/api/schedule/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pins }) });
    setSolveResult(await res.json());
    onToast("Re-solved, keeping the locked placements", "success");
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-full">
          <Wrench className="w-8 h-8 text-amber-600" />
        </div>
        <div>
          <h2 className="font-extrabold text-lg text-foreground">Backend not reachable</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        </div>
        <Button variant="outline" size="md" onClick={reload} className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading intelligence layer…
      </div>
    );
  }

  const tabs = [
    { id: "radar" as const, label: "Radar", icon: <Radar className="w-3.5 h-3.5" /> },
    { id: "margins" as const, label: "4-Course", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: "utilization" as const, label: "Utilization", icon: <Gauge className="w-3.5 h-3.5" /> },
    { id: "matrices" as const, label: "Matrices", icon: <Database className="w-3.5 h-3.5" /> },
    { id: "solve" as const, label: "Solve", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "tighten" as const, label: "Tighten", icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: "planning" as const, label: "Planning", icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: "audit" as const, label: "Audit", icon: <ScrollText className="w-3.5 h-3.5" /> },
  ];

  const matrixRows: [string, SparseMatrixPayload][] = matrices ? [
    ["Classroom (rooms × courses)", matrices.classroom],
    ["Degree fulfilment (cohorts × courses)", matrices.fulfilment],
    ["Cohort demand (cohorts × courses)", matrices.demand],
    ["Cohort sections (cohorts × sections)", matrices.cohort_sections],
    ["Faculty availability (instructors × slots)", matrices.faculty_availability],
    ["Faculty blackouts", matrices.faculty_blackouts],
    ["Faculty preferences", matrices.faculty_preferences],
    ["Qualifications (instructors × courses)", matrices.qualification],
  ] : [];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-primary/10 p-2 text-primary"><Network className="h-4 w-4" /></span>
          <h2 className="font-extrabold text-foreground">Full</h2>
          <InfoTip text="Advanced workspace: spectral radar, 4-course audit, utilization, solver, and AI-proposed fixes the solver verifies first." />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => { runSolve(); onToast("Running CP-SAT solve…", "info"); }} disabled={busy !== null} className="flex items-center gap-1.5">
            {busy === "solve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Solve
          </Button>
          <Button variant="outline" size="sm" onClick={() => { runTighten(); onToast("Muse is proposing repairs…", "info"); }} disabled={busy !== null} className="flex items-center gap-1.5">
            {busy === "tighten" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
            Tighten
          </Button>
        </div>
      </div>

      {/* Tabs: scrollable pill bar, sticky while the page scrolls */}
      <div className="no-scrollbar sticky top-0 z-20 flex items-center gap-1.5 overflow-x-auto border-y border-border bg-card/95 px-3 py-2 backdrop-blur sm:px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "true" : undefined}
            className={cn(
              "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.97]",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-muted/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3 sm:p-4">
        {tab === "radar" && spectral && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-2 gap-3 lg:col-span-3">
              <Stat label="Algebraic connectivity μ₂" value={spectral.algebraic_connectivity.toFixed(3)} hint={spectral.algebraic_connectivity === 0 ? "disconnected → independent islands" : "tightly-coupled core"} />
              <Stat label="Hoffman chromatic lower bound" value={`χ ≥ ${spectral.hoffman_chromatic_lower_bound}`} hint="fewer colors needed than periods → feasible" />
              <Stat label="Max clique" value={spectral.max_clique.length} hint="sections that all pairwise conflict" />
              <Stat label="Largest Laplacian eigenvalue" value={spectral.largest_laplacian_eigenvalue.toFixed(2)} hint="rigidity of the conflict graph" />
            </div>

            <Card title="Scheduling islands" hint="Groups of sections linked by shared cohorts — islands solve independently." icon={<GitFork className="w-4 h-4 text-primary" />} className="lg:col-span-2">
              {spectral.components.map((comp, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <div className="text-[11px] text-muted-foreground mb-1">Island {i + 1} · {comp.length} section{comp.length > 1 ? "s" : ""}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {comp.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-muted rounded text-[11px] font-mono text-foreground">{s.replace("sec-", "")}</span>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            <Card title="Warm-start hints" hint="Spectral (Fiedler) coloring → solver warm start. Hints guide the search; they never break feasibility." icon={<Activity className="w-4 h-4 text-emerald-600" />}>
              {Object.entries(spectral.slot_hints).length ? (
                <div className="space-y-1">
                  {Object.entries(spectral.slot_hints).map(([sid, period]) => (
                    <div key={sid} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{sid.replace("sec-", "")}</span>
                      <span className="text-emerald-700 font-semibold">period {period}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No hint needed.</p>
              )}
            </Card>

            {spectral.deadlock_warnings.length > 0 && (
              <Card title="Deadlock warnings" icon={<CircleX className="w-4 h-4 text-amber-600" />} className="lg:col-span-3">
                <ul className="space-y-1.5">
                  {spectral.deadlock_warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                      <CircleX className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Solve order" hint="Spectral ordering: most-constrained sections placed first." icon={<Activity className="w-4 h-4 text-sky-600" />} className="lg:col-span-3">
              <div className="flex flex-wrap gap-1.5">
                {spectral.spectral_order.map((s, i) => (
                  <span key={s} className="px-2 py-0.5 bg-sky-50 border border-sky-200 rounded text-[11px] font-mono text-sky-900">
                    {i + 1}. {s.replace("sec-", "")}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "margins" && margins && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Fit <strong className="text-foreground">{margins.min_courses}+</strong> non-overlapping courses per cohort</span>
              <InfoTip text="Each cohort must assemble this many distinct, mutually non-overlapping courses toward graduation in the placed timetable." />
            </div>
            <div className="space-y-2">
              {margins.cohorts.map((m) => (
                <div key={m.cohort_id} className={cn("border rounded-lg p-3", m.ok ? "bg-emerald-50/40 border-emerald-200" : "bg-amber-50/60 border-amber-200")}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-bold text-foreground">{m.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-2">{m.size} students · {m.terms_remaining} terms to graduation</span>
                    </div>
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", m.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                      {m.margin} / {margins.min_courses} courses
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {m.example_track.map((c) => (
                      <span key={c} className="px-2 py-0.5 bg-white border border-border rounded text-[11px] font-mono text-foreground">{c}</span>
                    ))}
                    {m.example_track.length === 0 && <span className="text-[11px] text-muted-foreground">no placed courses</span>}
                  </div>
                  <p className={cn("text-[11px]", m.ok ? "text-emerald-700" : "text-amber-700")}>{m.risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "utilization" && utilization && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Campus utilization (peak)" value={`${Math.round(utilization.room_utilization * 100)}%`} hint="peak seats ÷ total capacity across rooms" />
              <Stat label="Faculty within load caps" value={utilization.all_loads_met ? <span className="text-emerald-600">✓ all</span> : <span className="text-amber-600">⚠ some over</span>} hint="no instructor over max_sections" />
            </div>

            <Card title="Room utilization" hint="Peak seats used ÷ capacity, per room." icon={<Gauge className="w-4 h-4 text-primary" />}>
              <div className="space-y-2">
                {utilization.rooms.map((r) => (
                  <div key={r.room_id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground sm:w-40">{r.name}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div className={cn("h-full rounded", r.utilization > 0.9 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${Math.round(r.utilization * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11px] font-mono text-muted-foreground sm:w-24">{r.peak_seats}/{r.capacity} · {Math.round(r.utilization * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Faculty load" hint="Assigned sections vs contract cap per instructor." icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}>
              <div className="space-y-2">
                {utilization.faculty.map((f) => (
                  <div key={f.instructor_id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground sm:w-40">{f.name}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div className={cn("h-full rounded", f.satisfied ? "bg-emerald-500" : "bg-red-400")} style={{ width: `${Math.round(f.utilization * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11px] font-mono text-muted-foreground sm:w-24">{f.load}/{f.max_sections}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "matrices" && matrices && (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Matrix</th>
                    <th className="text-left px-3 py-2 font-semibold">Shape</th>
                    <th className="text-right px-3 py-2 font-semibold">NNZ</th>
                    <th className="text-right px-3 py-2 font-semibold">Density</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map(([label, m]) => (
                    <tr key={label} className="border-t border-border">
                      <td className="px-3 py-1.5 text-foreground">{label}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{m.shape[0]}×{m.shape[1]}</td>
                      <td className="px-3 py-1.5 font-mono text-right">{m.nnz}</td>
                      <td className="px-3 py-1.5 font-mono text-right">{Math.round(m.density * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Card title="Faculty supply by slot" hint="All instructor availability stacked: how many faculty can teach each slot. Red = dead zone, nobody available." icon={<Database className="w-4 h-4 text-primary" />}>
              <div className="grid grid-cols-6 gap-1 items-center">
                <div />
                {DAY_NAMES.slice(0, 5).map((d) => (
                  <div key={d} className="text-[10px] text-muted-foreground font-semibold text-center">{d.slice(0, 3)}</div>
                ))}
                {PERIOD_NAMES.map((_, period) => (
                  <Fragment key={period}>
                    <div className="text-[10px] text-muted-foreground font-semibold">{PERIOD_NAMES[period]}</div>
                    {Array.from({ length: 5 }, (_, day) => {
                      const value = matrices.department_capacity[day]?.[period] ?? 0;
                      const dead = matrices.dead_zones.some(([dd, pp]) => dd === day && pp === period);
                      return (
                        <div key={`${day}-${period}`} className={cn(
                          "h-9 rounded flex items-center justify-center text-xs font-bold",
                          dead ? "bg-red-100 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-100"
                        )}>
                          {dead ? "0" : value}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              {!matrices.dead_zones.length && (
                <p className="text-[10px] text-emerald-700 mt-2">No dead zones — every slot has supply.</p>
              )}
            </Card>
          </div>
        )}

        {tab === "solve" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={runSolve} disabled={busy !== null || busyOptions} className="flex items-center gap-1.5">
                {busy === "solve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Solve
              </Button>
              <Button variant="outline" size="sm" onClick={runOptions} disabled={busyOptions} className="flex items-center gap-1.5">
                {busyOptions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
                Generate 3 options
              </Button>
            </div>

            {options && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {options.map((o) => {
                  const loads = o.timetable?.sections_per_instructor ?? {};
                  const vals = Object.values(loads);
                  const maxLoad = vals.length ? Math.max(...vals) : 0;
                  const idle = vals.filter((n) => n === 0).length;
                  const label = o.objective_name === "balanced_load" ? "Balanced faculty load"
                    : o.objective_name === "room_fit" ? "Tightest room fit" : "Preference-optimal";
                  const active = solveResult === o;
                  return (
                    <button key={o.objective_name} onClick={() => setSolveResult(o)}
                      className={cn("text-left border rounded-lg p-3 transition-colors", active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                      <div className="font-bold text-sm text-foreground">{label}</div>
                      {o.status === "infeasible" ? (
                        <div className="text-[11px] text-red-700 mt-1">
                          Infeasible — {o.conflicts?.explanation ?? "the solver named a conflict core"}
                          {o.conflicts?.sources && o.conflicts.sources.length > 0 && (
                            <span className="block mt-0.5">Source: {o.conflicts.sources.join(" · ")}</span>
                          )}
                        </div>
                      ) : (
                      <div className="text-[11px] text-muted-foreground mt-1">max load {maxLoad} · {idle} idle · {o.solve_time_ms} ms</div>
                      )}
                      <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                        {Object.entries(loads).sort().map(([k, v]) => `${k}:${v}`).join("  ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!solveResult ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Tap <strong className="text-foreground">Solve</strong>, or compare <strong className="text-foreground">3 options</strong>.
              </div>
            ) : solveResult.status === "infeasible" ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                Infeasible — the backend returns the minimal conflict core.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 flex-wrap">
                  <Stat label="Objective" value={<span className="text-emerald-600">{solveResult.objective_name ?? "preference"}</span>} />
                  <Stat label="Solve time" value={`${solveResult.solve_time_ms} ms`} />
                  {Object.values(locked).some(Boolean) && (
                    <Button variant="primary" size="sm" onClick={runPin} className="flex items-center gap-1.5">
                      Re-solve, keep {Object.values(locked).filter(Boolean).length} locked
                    </Button>
                  )}
                </div>
                <Card title="Placements" icon={<Sparkles className="w-4 h-4 text-primary" />}>
                  <div className="mb-3">
                    <TimetableGrid placements={solveResult.timetable?.placements ?? []} compact />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-2 font-semibold">Keep</th>
                          <th className="text-left px-3 py-2 font-semibold">Course</th>
                          <th className="text-left px-3 py-2 font-semibold">Instructor</th>
                          <th className="text-left px-3 py-2 font-semibold">Room</th>
                          <th className="text-left px-3 py-2 font-semibold">Slot</th>
                          <th className="text-right px-3 py-2 font-semibold">Length</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(solveResult.timetable?.placements ?? []).map((p) => (
                          <tr key={p.section_id} className="border-t border-border">
                            <td className="px-2 py-1.5">
                              <input type="checkbox" checked={!!locked[p.section_id]}
                                onChange={() => setLocked((prev) => ({ ...prev, [p.section_id]: !prev[p.section_id] }))}
                                className="h-3.5 w-3.5" aria-label={`keep ${p.course_code}`} />
                            </td>
                            <td className="px-3 py-1.5 font-semibold text-foreground">{p.course_code}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.instructor_name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.room_name} <span className="text-[10px]">[{p.building_id}]</span></td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{placementSlot(p)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{p.duration ?? 1.5}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === "tighten" && (
          <div className="space-y-4">
            {!tighten ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Tap <strong className="text-foreground">Tighten</strong> — AI proposes repairs, the solver verifies each one.
              </div>
            ) : (
              <>
                <div className={cn(
                  "border rounded-lg p-3 text-sm",
                  tighten.trigger === "none" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : tighten.trigger === "infeasible" ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide",
                      tighten.muse_mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-muted text-muted-foreground")}>
                      {tighten.muse_mode}
                    </span>
                    <span className="text-[11px] font-bold uppercase">{tighten.trigger}</span>
                  </div>
                  <p>{tighten.assessment}</p>
                </div>

                {tighten.moves.length > 0 && (
                  <Card title={`Moves (${tighten.moves.filter((m) => m.verified).length} verified)`} icon={<Wrench className="w-4 h-4 text-primary" />}>
                    <div className="space-y-2">
                      {tighten.moves.map((mv, i) => (
                        <div key={i} className={cn("border rounded-lg p-3", mv.verified ? "border-emerald-200 bg-emerald-50/40" : "border-border bg-muted/30")}>
                          <div className="flex items-center gap-2 mb-1">
                            {mv.verified
                              ? <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                              : <CircleX className="w-4 h-4 text-muted-foreground shrink-0" />}
                            <span className="font-mono text-xs font-bold text-foreground">{mv.kind}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {[mv.instructor_id, mv.course_id, mv.cohort_id].filter(Boolean).join(" → ")}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mb-1">{mv.rationale}</p>
                          <p className={cn("text-[11px] font-medium", mv.verified ? "text-emerald-700" : "text-muted-foreground")}>{mv.detail}</p>
                          {mv.verified ? (
                            <Button variant="primary" size="sm" disabled={applyingMove !== null || appliedMove === i}
                              onClick={() => void applyMove(i)} className="mt-2">
                              {applyingMove === i ? "Re-verifying…" : appliedMove === i ? "Elected repair applied" : "Elect this repair"}
                            </Button>
                          ) : (
                            <p className="text-[10px] font-semibold text-muted-foreground mt-1">Rejected by the solver — shown for transparency, cannot be applied.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {tab === "planning" && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Simulate a change before committing</span>
              <InfoTip text="Each what-if is re-solved first: feasibility, utilization, and 4-course guarantee deltas — before any money is spent." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: "add_lab", label: "Build a new lab", desc: "Add a 35-seat computer lab" },
                { id: "grow_enrollment", label: "20% growth", desc: "Every cohort grows 20%" },
                { id: "repurpose_hall", label: "Repurpose a hall", desc: "Largest lecture → lab" },
              ].map((c) => (
                <Button key={c.id} variant="outline" size="md" onClick={() => runWhatif(c.id)} disabled={whatifBusy} className="flex flex-col items-start gap-0.5 h-auto py-2.5">
                  <span className="font-semibold">{c.label}</span>
                  <span className="text-[11px] text-muted-foreground">{c.desc}</span>
                </Button>
              ))}
            </div>

            {whatifBusy && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> solving the what-if…
              </div>
            )}

            {whatif && (
              <Card title={whatif.label} icon={<Building2 className="w-4 h-4 text-primary" />}>
                <p className="text-xs text-muted-foreground mb-3">{whatif.description}</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Stat label="Utilization" value={`${Math.round(whatif.before_utilization * 100)}% → ${Math.round(whatif.after_utilization * 100)}%`} />
                  <Stat label="Feasibility" value={
                    <span className={cn("text-sm", whatif.after_status === "infeasible" ? "text-red-600" : "text-emerald-600")}>
                      {whatif.before_status} → {whatif.after_status}
                    </span>
                  } />
                  <Stat label="Four-course guarantee" value={
                    <span className={cn("text-sm", whatif.after_margins_ok ? "text-emerald-600" : "text-amber-600")}>
                      {whatif.before_margins_ok ? "✓" : "✗"} → {whatif.after_margins_ok ? "✓" : "✗"}
                    </span>
                  } />
                  <Stat label="Faculty load (max)" value={
                    `${Math.max(0, ...Object.values(whatif.before_loads))} → ${Math.max(0, ...Object.values(whatif.after_loads))}`
                  } />
                </div>
                <div className={cn("border rounded-lg p-3 text-sm", whatif.after_status === "infeasible" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}>
                  {whatif.verdict}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Provenance ledger, newest first</span>
                <InfoTip text="Every intake submission and change event behind this timetable, with parser mode and timestamps." />
              </div>
              <Button variant="outline" size="sm" onClick={reloadAudit} disabled={auditLoading} className="flex items-center gap-1.5 shrink-0">
                {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card title={`Submissions (${history?.submissions.length ?? 0})`} icon={<ScrollText className="w-4 h-4 text-primary" />}>
                <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                  {history?.submissions.map((s) => (
                    <div key={s.id} className="border border-border rounded p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("px-1.5 py-0.5 rounded font-bold uppercase text-[9px]", s.parser_mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-muted")}>
                          {s.parser_mode}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{new Date(s.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 font-medium text-foreground">{s.message}</div>
                      {s.summary && <div className="text-muted-foreground mt-0.5">{s.summary}</div>}
                    </div>
                  ))}
                  {!history?.submissions.length && <p className="text-xs text-muted-foreground">No submissions yet.</p>}
                </div>
              </Card>
              <Card title={`Change events (${history?.events.length ?? 0})`} icon={<Activity className="w-4 h-4 text-emerald-600" />}>
                <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                  {history?.events.map((e) => (
                    <div key={e.id} className="border border-border rounded p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-muted font-bold uppercase text-[9px]">{e.kind.replaceAll("_", " ")}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-foreground">{e.description}</div>
                    </div>
                  ))}
                  {!history?.events.length && <p className="text-xs text-muted-foreground">No events yet.</p>}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}