"use client";

// Deliverables: the role outputs the landing preview promises, rendered from
// the live institution model — proof chips, telemetry charts, a filterable
// master extract, faculty preference/load detail and a cohort degree plan.
//
// Data: /api/scenario + the published timetable (or a fresh solve) +
// /api/intelligence/{utilization,margins}. The numbers are computed from the
// current institution model; the shipped model itself is synthetic demo data.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  GraduationCap,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { EChart } from "@/components/ui/echart";
import { CampusMatrix } from "@/components/landing/campus-matrix";
import { buildLiveCampus } from "@/lib/campus-live";
import { authFetch, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DAY_NAMES,
  type Cohort,
  type MarginsReport,
  type Placement,
  type Scenario,
  type UtilizationReport,
} from "@/types";
import {
  aggregateMetrics,
  buildRows,
  cohortPlan,
  downloadCsv,
  instructorMetrics,
  proofMetrics,
  rowsToCsv,
  type BuildingUtilization,
  type DeliverableRow,
  type PreferenceMetrics,
} from "@/lib/deliverables";

type RoleTab = "admin" | "instructor" | "student";

const ROLE_LABEL: Record<RoleTab, string> = {
  admin: "Admin deliverable",
  instructor: "Instructor view",
  student: "Student track",
};

const WINDOWS = ["Morning", "Afternoon", "Evening"] as const;

const CHART_GRID = { top: 22, bottom: 22, left: 38, right: 14 };

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function Panel({
  title,
  hint,
  icon,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 shadow-xs transition-all duration-300 hover:shadow-card-hover",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
            <div className="min-w-0">
              {title && <h3 className="truncate text-xs font-bold tracking-tight text-slate-800">{title}</h3>}
              {hint && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{hint}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// --- chart options ----------------------------------------------------------

function buildingOption(data: BuildingUtilization[]): EChartsOption {
  return {
    tooltip: { trigger: "axis", formatter: "{b}: {c}%" },
    grid: CHART_GRID,
    xAxis: {
      type: "category",
      data: data.map((d) => d.name),
      axisLabel: { fontSize: 9, color: "#64748b", interval: 0, width: 70, overflow: "truncate" },
    },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", fontSize: 9, color: "#94a3b8" } },
    series: [
      {
        type: "bar",
        barWidth: "38%",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: "{c}%", fontSize: 9, fontWeight: "bold" },
        data: data.map((d) => ({
          value: d.utilization,
          itemStyle: { color: d.utilization > 90 ? "#e11d48" : d.utilization > 75 ? "#f59e0b" : "#2563eb" },
        })),
      },
    ],
  };
}

function cohortOption(margins: MarginsReport | null): EChartsOption {
  const rows = margins?.cohorts ?? [];
  return {
    tooltip: { trigger: "axis", formatter: "{b}: {c} courses" },
    grid: { top: 15, bottom: 15, left: 74, right: rows.length > 10 ? 44 : 34 },
    dataZoom:
      rows.length > 10
        ? [
            { type: "inside", yAxisIndex: 0 },
            { type: "slider", yAxisIndex: 0, width: 8, right: 2, showDetail: false },
          ]
        : undefined,
    xAxis: { type: "value", max: Math.max(margins?.min_courses ?? 4, 6), axisLabel: { fontSize: 8, color: "#94a3b8" } },
    yAxis: {
      type: "category",
      data: rows.map((c) => c.name.replace(" cohort", "")),
      axisLabel: { fontSize: 9, color: "#64748b" },
    },
    series: [
      {
        type: "bar",
        barWidth: "45%",
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", formatter: "{c}", fontSize: 9, fontWeight: "bold" },
        data: rows.map((c) => ({
          value: c.margin,
          itemStyle: { color: c.ok ? "#10b981" : "#f59e0b" },
        })),
      },
    ],
  };
}

function facultyLoadOption(faculty: UtilizationReport["faculty"]): EChartsOption {
  return {
    tooltip: { trigger: "axis", formatter: "{b}: {c}% of contract" },
    grid: { top: 15, bottom: 15, left: 84, right: faculty.length > 12 ? 44 : 34 },
    dataZoom:
      faculty.length > 12
        ? [
            { type: "inside", yAxisIndex: 0 },
            { type: "slider", yAxisIndex: 0, width: 8, right: 2, showDetail: false },
          ]
        : undefined,
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", fontSize: 8, color: "#94a3b8" } },
    yAxis: {
      type: "category",
      data: faculty.map((f) => f.name.replace("Prof. ", "")),
      axisLabel: { fontSize: 9, color: "#047857" },
    },
    series: [
      {
        type: "bar",
        barWidth: "45%",
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", formatter: "{c}%", fontSize: 9, fontWeight: "bold" },
        data: faculty.map((f) => ({
          value: Math.round(f.utilization * 100),
          itemStyle: { color: f.satisfied ? "#10b981" : "#e11d48" },
        })),
      },
    ],
  };
}

function radarOption(metrics: PreferenceMetrics, name: string): EChartsOption {
  return {
    tooltip: {},
    radar: {
      indicator: [
        { name: "Hard constraint", max: 100 },
        { name: "Time preference", max: 100 },
        { name: "Course preference", max: 100 },
        { name: "Zone travel", max: 100 },
        { name: "Soft weight", max: 100 },
      ],
      radius: "56%",
      axisName: { fontSize: 8, color: "#5b21b6" },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: [metrics.hard, metrics.time, metrics.course, metrics.travel, metrics.soft],
            name,
            areaStyle: { color: "rgba(124, 58, 237, 0.22)" },
            lineStyle: { color: "#7c3aed", width: 2 },
          },
        ],
      },
    ],
  };
}

function instructorCoursesOption(rows: DeliverableRow[]): EChartsOption {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.code, (counts.get(r.code) ?? 0) + 1));
  const entries = [...counts.entries()];
  return {
    tooltip: { trigger: "axis", formatter: "{b}: {c} section(s)" },
    grid: { top: 15, bottom: 15, left: 74, right: 34 },
    xAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 8 } },
    yAxis: { type: "category", data: entries.map(([code]) => code), axisLabel: { fontSize: 9, color: "#4c1d95" } },
    series: [
      {
        type: "bar",
        barWidth: "45%",
        itemStyle: { borderRadius: [0, 4, 4, 0], color: "#7c3aed" },
        label: { show: true, position: "right", formatter: "{c}", fontSize: 9, fontWeight: "bold" },
        data: entries.map(([, count]) => count),
      },
    ],
  };
}

function degreeOption(required: number, elective: number): EChartsOption {
  return {
    tooltip: { trigger: "item", formatter: "{b}: {c} course(s) ({d}%)" },
    legend: { bottom: "0%", left: "center", textStyle: { fontSize: 9, color: "#065f46" } },
    series: [
      {
        type: "pie",
        radius: ["42%", "70%"],
        center: ["50%", "40%"],
        label: { show: false },
        data: [
          { value: required, name: "Required core", itemStyle: { color: "#059669" } },
          { value: elective, name: "Elective choice", itemStyle: { color: "#7c3aed" } },
        ],
      },
    ],
  };
}

function timeOfDayOption(day: number, evening: number): EChartsOption {
  return {
    tooltip: { trigger: "axis", formatter: "{b}: {c} section(s)" },
    grid: { top: 22, bottom: 24, left: 32, right: 14 },
    xAxis: { type: "category", data: ["Daytime", "Evening 18:00+"], axisLabel: { fontSize: 9, color: "#047857" } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 8 } },
    series: [
      {
        type: "bar",
        barWidth: "40%",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: "{c}", fontSize: 9, fontWeight: "bold" },
        data: [
          { value: day, itemStyle: { color: "#10b981" } },
          { value: evening, itemStyle: { color: "#8b5cf6" } },
        ],
      },
    ],
  };
}

// --- view -------------------------------------------------------------------

export function DeliverablesView({
  user,
  onToast,
  onOpenFull,
}: {
  user: AuthUser;
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
  onOpenFull?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<"published" | "live">("live");
  const [utilization, setUtilization] = useState<UtilizationReport | null>(null);
  const [margins, setMargins] = useState<MarginsReport | null>(null);

  const [role, setRole] = useState<RoleTab>(
    user.role === "instructor" ? "instructor" : user.role === "student" ? "student" : "admin"
  );
  const [instructorId, setInstructorId] = useState<string>(
    user.instructor_id ?? ""
  );
  const [cohortId, setCohortId] = useState<string>(user.cohort_id ?? "");
  const [inspector, setInspector] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");

  const [filters, setFilters] = useState({ dept: "ALL", building: "ALL", day: "ALL", window: "ALL", roomType: "ALL" });

  const load = useCallback(async () => {
    try {
      const scRes = await fetch("/api/scenario");
      if (!scRes.ok) throw new Error("Institution model unavailable.");
      const sc: Scenario = await scRes.json();
      setScenario(sc);

      let timetable: Placement[] = [];
      let nextStatus = "";
      let nextSource: "published" | "live" = "live";

      const current = await authFetch("/api/schedule/current");
      if (current.ok) {
        const data = await current.json();
        timetable = data.timetable?.placements ?? [];
        nextStatus = data.status ?? "";
        nextSource = "published";
      }
      if (timetable.length === 0) {
        const solveRes = await authFetch("/api/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine: "cpsat" }),
        });
        const solved = await solveRes.json();
        if (!solveRes.ok) throw new Error(solved.detail || solved.error || "Solve failed.");
        timetable = solved.timetable?.placements ?? [];
        nextStatus = solved.status ?? "";
      }

      setPlacements(timetable);
      setStatus(nextStatus);
      setSource(nextSource);

      const [uRes, mRes] = await Promise.all([
        fetch("/api/intelligence/utilization"),
        fetch("/api/intelligence/margins"),
      ]);
      setUtilization(uRes.ok ? ((await uRes.json()) as UtilizationReport) : null);
      setMargins(mRes.ok ? ((await mRes.json()) as MarginsReport) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load deliverables.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!inspector) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setInspector(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspector]);

  useEffect(() => {
    // Mount fetch: every state write inside `load` happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rows = useMemo(
    () => (scenario ? buildRows(scenario, placements) : []),
    [scenario, placements]
  );

  const activeInstructor = useMemo(() => {
    if (!scenario) return null;
    return (
      scenario.instructors.find((i) => i.id === instructorId) ??
      scenario.instructors[0] ??
      null
    );
  }, [scenario, instructorId]);

  const activeCohort = useMemo<Cohort | null>(() => {
    if (!scenario) return null;
    return scenario.cohorts.find((c) => c.id === cohortId) ?? scenario.cohorts[0] ?? null;
  }, [scenario, cohortId]);

  const metrics = useMemo(() => {
    if (!scenario) return null;
    const per = scenario.instructors.map((i) => instructorMetrics(scenario, placements, i.id));
    return { per, all: aggregateMetrics(per) };
  }, [scenario, placements]);

  const instructorMetric = useMemo(() => {
    if (!scenario || !activeInstructor) return null;
    return instructorMetrics(scenario, placements, activeInstructor.id);
  }, [scenario, placements, activeInstructor]);

  const plan = useMemo(() => {
    if (!scenario || !activeCohort) return null;
    return cohortPlan(scenario, placements, activeCohort, margins);
  }, [scenario, placements, activeCohort, margins]);

  const proof = useMemo(() => {
    if (!scenario || !metrics) return null;
    return proofMetrics(scenario, placements, rows, utilization, margins, metrics.all);
  }, [scenario, placements, rows, utilization, margins, metrics]);

  const instructorRows = useMemo(
    () => (activeInstructor ? rows.filter((r) => r.instructorId === activeInstructor.id) : []),
    [rows, activeInstructor]
  );

  const liveCampus = useMemo(
    () => (scenario ? buildLiveCampus(scenario, placements) : null),
    [scenario, placements]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        return (
          (filters.dept === "ALL" || r.dept === filters.dept) &&
          (filters.building === "ALL" || r.buildingId === filters.building) &&
          (filters.day === "ALL" || r.days.includes(Number(filters.day))) &&
          (filters.window === "ALL" || r.window === filters.window) &&
          (filters.roomType === "ALL" || r.roomType === filters.roomType)
        );
      }),
    [rows, filters]
  );

  const facets = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values)].sort();
    return {
      depts: uniq(rows.map((r) => r.dept)),
      buildings: scenario ? scenario.buildings.filter((b) => rows.some((r) => r.buildingId === b.id)) : [],
      days: [...new Set(rows.flatMap((r) => r.days))].sort((a, b) => a - b),
      windows: WINDOWS.filter((w) => rows.some((r) => r.window === w)),
      roomTypes: uniq(rows.map((r) => r.roomType).filter(Boolean)),
    };
  }, [rows, scenario]);

  const exportCsv = () => {
    downloadCsv(
      `schedulesolve_${role}_deliverable_${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(role === "instructor" ? instructorRows : role === "student" ? (plan?.courses.map((c) => c.row).filter(Boolean) as DeliverableRow[]) : filteredRows)
    );
    onToast("Deliverable exported as CSV", "success");
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Building deliverables from the live model…
      </div>
    );
  }

  if (error || !scenario || !proof || !metrics) {
    return (
      <Panel title="Deliverables unavailable" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}>
        <p className="text-sm text-muted-foreground">{error ?? "The institution model could not be loaded."}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            void load();
          }}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </Panel>
    );
  }

  const proofCards = [
    {
      key: "facility",
      label: "Facility peak",
      value: `${proof.peakUtilization}%`,
      tone: "text-slate-900",
    },
    {
      key: "load",
      label: "Faculty load",
      value: `${proof.facultyWithinCap}/${proof.facultyTotal} within cap`,
      tone: proof.allLoadsMet ? "text-emerald-600" : "text-rose-600",
    },
    {
      key: "prefs",
      label: "Faculty prefs",
      value: `${pct(proof.prefMatch)} match`,
      tone: "text-purple-700",
    },
    {
      key: "cohort",
      label: `${proof.minCourses}-course guarantee`,
      value: proof.marginsOk ? "0 shortfalls" : `${proof.marginShortfalls} shortfall(s)`,
      tone: proof.marginsOk ? "text-blue-600" : "text-amber-600",
    },
    {
      key: "walk",
      label: "Walk limit",
      value: `≤${proof.walkLimit} min`,
      tone: "text-slate-900",
    },
    {
      key: "evening",
      label: "Evening tracks",
      value: `${proof.eveningSections} section(s)`,
      tone: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Role deliverables
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                source === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              )}
              title={
                source === "published"
                  ? "Rendered from the published term schedule."
                  : "No published schedule yet — rendered from a fresh verified solve."
              }
            >
              {source === "published" ? "Published term" : "Live solve"}
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {status || "solved"}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">What each role receives</h2>
          <p className="text-xs text-slate-500">
            Every number below is computed from {placements.length} placed sections, {scenario.instructors.length} faculty and{" "}
            {scenario.rooms.length} rooms in the current model (synthetic demo data unless you imported your own).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-muted/60 p-1">
            {(["admin", "instructor", "student"] as RoleTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setRole(tab)}
                className={cn(
                  "min-h-8 rounded-lg px-2.5 text-[11px] font-semibold transition-all",
                  role === tab ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {ROLE_LABEL[tab]}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-border bg-muted/60 p-1">
            {(
              [
                ["table", "Table + ECharts"],
                ["calendar", "Calendar Matrix"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={cn(
                  "min-h-8 rounded-lg px-2.5 text-[11px] font-semibold transition-all",
                  viewMode === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
            setLoading(true);
            setError(null);
            void load();
          }}
            title="Re-read the model and re-solve if needed"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Proof chips */}
      {viewMode === "table" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {proofCards.map((card) => (
            <button
              key={card.key}
              onClick={() => setInspector(card.key)}
              className="rounded-lg border border-slate-200/80 bg-slate-50 p-2 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
            >
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{card.label}</div>
              <div className={cn("mt-0.5 truncate text-xs font-bold", card.tone)}>{card.value}</div>
            </button>
          ))}
        </div>
      )}

      {viewMode === "calendar" ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Live Deliverable
              </span>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Campus Timetable Matrix &amp; Heatmap</h3>
              <p className="text-[11px] font-medium text-slate-500">
                Every cell is read from the placed term: room, day and period.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Solver verified
            </span>
          </div>
          <CampusMatrix onToast={onToast} live={liveCampus} />
        </div>
      ) : (
        <>
      {/* ADMIN */}
      {role === "admin" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel
              title="Campus zone utilization"
              hint="Peak simultaneous scheduled seats ÷ building capacity."
              icon={<Building2 className="h-4 w-4 text-primary" />}
            >
              <EChart option={buildingOption(proof.facility)} className="h-40 w-full" label="Utilization by building" />
            </Panel>

            <Panel
              title="Max unique choice by cohort"
              hint={`Distinct, non-overlapping courses each cohort can take this term (target ≥ ${proof.minCourses}).`}
              icon={<GraduationCap className="h-4 w-4 text-purple-600" />}
            >
              <EChart option={cohortOption(margins)} className="h-40 w-full" label="Course choice by cohort" />
            </Panel>

            <Panel
              title="Faculty teaching load compliance"
              hint="Assigned sections ÷ contract cap per instructor."
              icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
            >
              <EChart option={facultyLoadOption(utilization?.faculty ?? [])} className="h-40 w-full" label="Faculty load compliance" />
            </Panel>

            <Panel
              title="Faculty preference match"
              hint="Averaged across all faculty: hard constraints, time/course wishes, walk limits, soft weights."
              icon={<BarChart3 className="h-4 w-4 text-purple-600" />}
            >
              <EChart option={radarOption(metrics.all, "Faculty preferences")} className="h-40 w-full" label="Faculty preference radar" />
            </Panel>
          </div>

          <Panel
            title="University master schedule extract"
            hint="The full placed timetable. Filters apply to the table and to the CSV export."
            icon={<Layers className="h-4 w-4 text-primary" />}
            className="bg-white"
            action={
              <button
                onClick={exportCsv}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-[11px] font-bold hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5 text-primary" /> Export CSV
              </button>
            }
          >
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { key: "dept" as const, label: "Department", options: facets.depts.map((d) => [d, d]) },
                {
                  key: "building" as const,
                  label: "Building",
                  options: facets.buildings.map((b) => [b.id, b.name]),
                },
                {
                  key: "day" as const,
                  label: "Day",
                  options: facets.days.map((d) => [String(d), DAY_NAMES[d]]),
                },
                {
                  key: "window" as const,
                  label: "Time window",
                  options: facets.windows.map((w) => [w, w]),
                },
                {
                  key: "roomType" as const,
                  label: "Room type",
                  options: facets.roomTypes.map((t) => [t, t]),
                },
              ].map((facet) => (
                <div key={facet.key}>
                  <label htmlFor={`extract-${facet.key}`} className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {facet.label}
                  </label>
                  <select
                    id={`extract-${facet.key}`}
                    value={filters[facet.key]}
                    onChange={(e) => setFilters((f) => ({ ...f, [facet.key]: e.target.value }))}
                    className="min-h-8 w-full rounded-lg border border-border bg-background px-2 text-[11px] font-medium"
                  >
                    <option value="ALL">All</option>
                    {facet.options.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted/90 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="p-2.5">Course &amp; dept</th>
                    <th className="p-2.5">Faculty</th>
                    <th className="p-2.5">Facility</th>
                    <th className="p-2.5">Day &amp; time</th>
                    <th className="p-2.5">Equipment</th>
                    <th className="p-2.5 text-right">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((row) => (
                    <tr key={row.sectionId} className="hover:bg-accent/40">
                      <td className="p-2.5">
                        <span className="font-bold">{row.code}</span> {row.title}
                        <span className="ml-1.5 rounded border border-primary/20 bg-primary/10 px-1 py-0.5 font-mono text-[9px] font-bold text-primary">
                          {row.dept}
                        </span>
                      </td>
                      <td className="p-2.5">
                        {row.instructorName}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({utilization?.faculty.find((f) => f.instructor_id === row.instructorId)?.load ?? 0}/
                          {utilization?.faculty.find((f) => f.instructor_id === row.instructorId)?.max_sections ?? "—"})
                        </span>
                      </td>
                      <td className="p-2.5">
                        {row.roomName}
                        <span className="block text-[10px] text-muted-foreground">{row.buildingName}</span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px]">
                        {row.dayShort} {row.start}–{row.end}
                        <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px]">{row.window}</span>
                      </td>
                      <td className="p-2.5">
                        {row.equipmentOk ? (
                          <span className="text-[10px] font-semibold text-emerald-600">ready</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-600">missing {row.missingEquipment.join(", ")}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          SOLVER-PROVEN
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-[11px] text-muted-foreground">
                        No sections match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {filteredRows.length} of {rows.length} sections · {proof.peakUtilization}% peak facility utilization
              </span>
              {onOpenFull && (
                <button onClick={onOpenFull} className="font-bold text-primary hover:underline">
                  Open full analytics →
                </button>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* INSTRUCTOR */}
      {role === "instructor" && activeInstructor && instructorMetric && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-sm font-bold text-purple-700">
                {activeInstructor.name.replace("Prof. ", "").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold">{activeInstructor.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {instructorMetric.sections} section(s) · {activeInstructor.max_sections} cap ·{" "}
                  {instructorMetric.satisfied}/{instructorMetric.total} stated preference(s) honoured
                </p>
              </div>
            </div>
            <select
              value={activeInstructor.id}
              onChange={(e) => setInstructorId(e.target.value)}
              className="min-h-9 rounded-xl border border-border bg-background px-2 text-xs font-medium"
              aria-label="Instructor"
            >
              {scenario.instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <Panel
            title="Preference summary & personal constraints"
            hint="What this professor asked for, and whether the placed term honours it."
            icon={<Wrench className="h-4 w-4 text-purple-600" />}
            className="border-purple-200 bg-purple-50/70"
            action={
              <span className="rounded-md bg-purple-100 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-800">
                {pct(instructorMetric.overall)} match
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                <div className="mb-1 font-bold text-foreground">Teaching</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    • <strong className="text-foreground">Assigned:</strong>{" "}
                    {instructorRows.map((r) => r.code).join(", ") || "none this term"}
                  </li>
                  <li>
                    • <strong className="text-foreground">Qualified:</strong>{" "}
                    {activeInstructor.qualified_courses
                      .map((id) => scenario.courses.find((c) => c.id === id)?.code ?? id)
                      .join(", ") || "—"}
                  </li>
                  <li>
                    • <strong className="text-foreground">Load:</strong> {instructorMetric.sections}/
                    {activeInstructor.max_sections} sections · {activeInstructor.max_preps} prep cap
                  </li>
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                <div className="mb-1 font-bold text-foreground">Hard constraints</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    • <strong className="text-foreground">Blackouts:</strong>{" "}
                    {activeInstructor.hard_unavailable.length === 0
                      ? "none"
                      : activeInstructor.hard_unavailable
                          .map(
                            (s) =>
                              `${DAY_NAMES[s.day]}${s.period !== undefined && s.period !== null ? ` P${s.period}` : " (all day)"}`
                          )
                          .join(", ")}
                  </li>
                  <li>
                    • <strong className="text-foreground">Preferences:</strong>{" "}
                    {activeInstructor.preferences.length === 0
                      ? "none stated"
                      : activeInstructor.preferences
                          .map((p) => {
                            if (p.course_id) {
                              const code = scenario.courses.find((c) => c.id === p.course_id)?.code ?? p.course_id;
                              return `${p.kind} ${code}`;
                            }
                            const day = p.day !== undefined && p.day !== null ? DAY_NAMES[p.day] : "any day";
                            const period = p.period !== undefined && p.period !== null ? `P${p.period}` : "any period";
                            return `${p.kind} ${day} ${period}`;
                          })
                          .join(" · ")}
                  </li>
                  <li>
                    • <strong className="text-foreground">Walk limit:</strong> ≤{scenario.walk_limit_min} min between halls
                  </li>
                </ul>
              </div>
            </div>
            {instructorMetric.violations.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                {instructorMetric.violations.map((v) => (
                  <div key={v}>• {v}</div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel
              title="Sections per course"
              hint="Teaching mix for the placed term."
              icon={<BarChart3 className="h-4 w-4 text-purple-600" />}
              className="border-purple-200/80 bg-purple-50/50"
            >
              <EChart option={instructorCoursesOption(instructorRows)} className="h-44 w-full" label="Sections per course" />
            </Panel>
            <Panel
              title="Preference match breakdown"
              hint="Hard constraints, wishes, travel and soft weights."
              icon={<ShieldCheck className="h-4 w-4 text-purple-600" />}
              className="border-purple-200/80 bg-purple-50/50"
            >
              <EChart option={radarOption(instructorMetric, activeInstructor.name)} className="h-44 w-full" label="Preference radar" />
            </Panel>
          </div>

          <Panel
            title="Assigned sections & facility readiness"
            hint="Every required equipment item is checked against the room that was assigned."
            icon={<MapPin className="h-4 w-4 text-primary" />}
            className="bg-white"
            action={
              <button
                onClick={exportCsv}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-[11px] font-bold hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5 text-primary" /> Export
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {instructorRows.map((row) => (
                <div key={row.sectionId} className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div className="font-bold text-primary">
                    {row.code} — {row.title}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {row.dayShort} {row.start}–{row.end} • {row.roomName} ({row.buildingName})
                  </div>
                  <div className={cn("mt-1 text-[10px] font-bold", row.equipmentOk ? "text-emerald-600" : "text-amber-600")}>
                    {row.equipmentOk ? "✓ Room equipment ready" : `⚠ Missing ${row.missingEquipment.join(", ")}`}
                  </div>
                </div>
              ))}
              {instructorRows.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No sections assigned this term.</p>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* STUDENT */}
      {role === "student" && plan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700">
                {plan.cohort.id.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold">{plan.cohort.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  Term {plan.cohort.current_term} · {plan.requiredCount} required · {plan.electiveCount} elective ·{" "}
                  {plan.guaranteeOk ? "guarantee met" : "guarantee shortfall"}
                </p>
              </div>
            </div>
            <select
              value={plan.cohort.id}
              onChange={(e) => setCohortId(e.target.value)}
              className="min-h-9 rounded-xl border border-border bg-background px-2 text-xs font-medium"
              aria-label="Cohort"
            >
              {scenario.cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel
              title="Degree map requirement breakdown"
              hint={`This term's roadmap: required core vs elective choice (${plan.requiredCount} + ${plan.electiveCount}).`}
              icon={<GraduationCap className="h-4 w-4 text-emerald-600" />}
              className="border-emerald-200/80 bg-emerald-50/50"
            >
              <EChart option={degreeOption(plan.requiredCount, plan.electiveCount)} className="h-44 w-full" label="Degree map breakdown" />
            </Panel>
            <Panel
              title="Working-professional fit"
              hint="Evening sections (18:00+) vs daytime, from the placed term."
              icon={<CalendarDays className="h-4 w-4 text-purple-600" />}
              className="border-emerald-200/80 bg-emerald-50/50"
            >
              <EChart option={timeOfDayOption(plan.dayCount, plan.eveningCount)} className="h-44 w-full" label="Daytime vs evening sections" />
            </Panel>
          </div>

          <Panel
            title="Guaranteed conflict-free class schedule"
            hint={`${plan.minCourses}-course guarantee: distinct courses, no day/period overlap.`}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            className="bg-white"
            action={
              <button
                onClick={exportCsv}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-[11px] font-bold hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5 text-primary" /> Export
              </button>
            }
          >
            <div className="space-y-1.5 text-xs">
              {plan.courses.map((course) => (
                <div
                  key={course.courseId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2.5"
                >
                  <div className="min-w-0">
                    <strong>{course.code}</strong> {course.title}{" "}
                    <span className="font-mono text-muted-foreground">
                      {course.row ? `(${course.row.dayShort} ${course.row.start} · ${course.row.roomName})` : "(not placed)"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        course.required ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      )}
                    >
                      {course.required ? "Required core" : "Elective"}
                    </span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold",
                        course.conflictFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {course.conflictFree ? "No conflict" : "Check overlap"}
                    </span>
                  </div>
                </div>
              ))}
              {plan.courses.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No roadmap courses for this cohort&apos;s current term.</p>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Guarantee margin: {plan.guaranteeMargin} distinct non-overlapping courses (minimum {plan.minCourses}).
            </p>
          </Panel>
        </div>
      )}
        </>
      )}

      {/* Proof inspector */}
      {inspector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <button
            aria-label="Close"
            onClick={() => setInspector(null)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="flex items-center gap-2 text-sm font-extrabold">
                <Info className="h-4 w-4 text-primary" />
                {proofCards.find((c) => c.key === inspector)?.label ?? "Proof"} — how it is computed
              </h3>
              <button onClick={() => setInspector(null)} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {inspector === "facility" && (
                <>
                  <p>
                    Peak seats scheduled ÷ total room capacity, per building, taken from{" "}
                    <code className="rounded bg-muted px-1">/intelligence/utilization</code>.
                  </p>
                  {proof.facility.map((b) => (
                    <div key={b.id} className="flex justify-between rounded-lg bg-muted/50 px-2 py-1.5">
                      <span>{b.name}</span>
                      <strong className="text-foreground">
                        {b.utilization}% ({b.peakSeats}/{b.capacity} seats)
                      </strong>
                    </div>
                  ))}
                </>
              )}
              {inspector === "load" && (
                <>
                  <p>Each instructor&apos;s assigned sections against their contract cap.</p>
                  {(utilization?.faculty ?? []).map((f) => (
                    <div key={f.instructor_id} className="flex justify-between rounded-lg bg-muted/50 px-2 py-1.5">
                      <span>{f.name}</span>
                      <strong className={f.satisfied ? "text-emerald-600" : "text-rose-600"}>
                        {f.load}/{f.max_sections} sections
                      </strong>
                    </div>
                  ))}
                </>
              )}
              {inspector === "prefs" && (
                <>
                  <p>
                    Weight-aware satisfaction of stated preferences plus hard blackouts, travel limits and course wishes —
                    averaged across {scenario.instructors.length} faculty.
                  </p>
                  {(
                    [
                      ["Hard constraints", metrics.all.hard],
                      ["Time preference", metrics.all.time],
                      ["Course preference", metrics.all.course],
                      ["Zone travel", metrics.all.travel],
                      ["Soft weight", metrics.all.soft],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between rounded-lg bg-muted/50 px-2 py-1.5">
                      <span>{label}</span>
                      <strong className="text-foreground">{value}%</strong>
                    </div>
                  ))}
                </>
              )}
              {inspector === "cohort" && (
                <>
                  <p>
                    Maximum mutually non-overlapping distinct courses each cohort can fit this term, from{" "}
                    <code className="rounded bg-muted px-1">/intelligence/margins</code>.
                  </p>
                  {(margins?.cohorts ?? []).map((c) => (
                    <div key={c.cohort_id} className="flex justify-between rounded-lg bg-muted/50 px-2 py-1.5">
                      <span>{c.name}</span>
                      <strong className={c.ok ? "text-emerald-600" : "text-amber-600"}>
                        {c.margin} course(s) {c.ok ? "· ok" : "· shortfall"}
                      </strong>
                    </div>
                  ))}
                </>
              )}
              {inspector === "walk" && (
                <p>
                  Campus walking times are capped at <strong className="text-foreground">{scenario.walk_limit_min} minutes</strong>{" "}
                  between consecutive classes. Any pair above the limit is never scheduled back-to-back.
                </p>
              )}
              {inspector === "evening" && (
                <>
                  <p>Sections starting at or after 18:00, so working students can attend.</p>
                  {rows
                    .filter((r) => r.window === "Evening")
                    .map((r) => (
                      <div key={r.sectionId} className="flex justify-between rounded-lg bg-muted/50 px-2 py-1.5">
                        <span>{r.code}</span>
                        <strong className="text-foreground">
                          {r.dayShort} {r.start}
                        </strong>
                      </div>
                    ))}
                  {proof.eveningSections === 0 && <p>No evening sections in the current term.</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
