"use client";

// Right-hand column of the landing page: headline, the "interactive future
// preview" window (role deliverables + weekly matrix), and the proof stats.
//
// Everything here is demo data — it exists to show what each role receives
// after signing in, before any backend call is made.

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  Sliders,
  Sparkles,
  Table,
  UserCheck,
} from "lucide-react";
import { EChart } from "@/components/ui/echart";
import { CampusMatrix } from "./campus-matrix";
import { CAMPUSES } from "./campus-data";
import {
  EMPTY_FILTERS,
  EXTRACT_FILTERS,
  EXTRACT_ROWS,
  INSTRUCTOR_PREFERENCES,
  INSTRUCTOR_SECTIONS,
  STUDENT_COURSES,
  matchesFilters,
  type CanvasMode,
  type FilterState,
  type Persona,
} from "./data";
import {
  facilityUtilOption,
  facultyLoadOption,
  facultyPrefRadarOption,
  instructorLoadOption,
  instructorPrefRadarOption,
  studentDegreeOption,
  studentWorkOption,
  uniqueChoiceOption,
} from "./charts";

const TITLES: Record<Persona, string> = {
  coordinator: "Master University Timetable Extract",
  instructor: "Faculty Workload & Preference Match Extract",
  student: "Student Cohort Degree Track & Working Fit Extract",
};

const CALENDAR_TITLE = "Campus Timetable Matrix & Heatmap";

// Live totals from the campus model (the reference hard-codes slightly stale
// numbers; deriving them keeps the KPI cards and footer in agreement).
const CAMPUS_TOTALS = Object.values(CAMPUSES).reduce(
  (acc, campus) => {
    campus.buildings.forEach((b) => {
      acc.buildings += 1;
      acc.rooms += b.totalRooms;
      acc.seats += b.totalSeats;
    });
    return acc;
  },
  { buildings: 0, rooms: 0, seats: 0 }
);

const DEPT_BADGE: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  purple: "bg-purple-50 text-purple-700 border-purple-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
};

const SLOT_BADGE: Record<string, string> = {
  Morning: "bg-slate-100 text-[9.5px] text-slate-600",
  Afternoon: "bg-slate-100 text-[9.5px] text-slate-600",
  Evening: "bg-purple-100 text-purple-700 text-[9.5px] font-semibold",
};

const PROOF_CARDS: { key: string; label: string; value: string; tone: string; labelTone?: string }[] = [
  { key: "utilization", label: "Facility Peak", value: "88.6% Peak", tone: "text-slate-900" },
  { key: "load", label: "Faculty Load", value: "68/68 within cap", tone: "text-emerald-600" },
  { key: "pref", label: "Faculty Prefs", value: "100.00% Match", tone: "text-purple-700", labelTone: "text-purple-700" },
  { key: "cohort", label: "4-Year Cohort", value: "0 Deadlocks", tone: "text-blue-600" },
  { key: "walk", label: "Walk Transit", value: "≥12m Buffer", tone: "text-slate-900" },
  { key: "evening", label: "Evening Tracks", value: "18:30+ Fit", tone: "text-purple-600" },
];

const CHART_CARD =
  "animate-chart-card rounded-xl border p-3 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover";

function ChartCard({
  title,
  badge,
  badgeClass,
  borderClass,
  delay,
  children,
}: {
  title: string;
  badge: string;
  badgeClass: string;
  borderClass: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${CHART_CARD} ${borderClass}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">{title}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${badgeClass}`}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function CoordinatorView({
  onInspect,
  onToast,
}: {
  onInspect: (key: string) => void;
  onToast: (message: string) => void;
}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const rows = useMemo(() => EXTRACT_ROWS.filter((r) => matchesFilters(r, filters)), [filters]);

  function setFilter(key: keyof FilterState, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const count = EXTRACT_ROWS.filter((r) => matchesFilters(r, next)).length;
    onToast(`Master Extract Filtered: ${count} sections match current parameters`);
  }

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {PROOF_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => onInspect(card.key)}
            className="proof-card rounded-lg border border-slate-200/80 bg-slate-50 p-2 text-left"
          >
            <div className={`text-[9px] font-semibold uppercase ${card.labelTone ?? "text-slate-500"}`}>
              {card.label}
            </div>
            <div className={`mt-0.5 text-xs font-bold ${card.tone}`}>{card.value}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
        <ChartCard
          title="Campus Zone Utilization (%)"
          badge="sample peak"
          badgeClass="bg-blue-50 text-blue-600"
          borderClass="border-slate-200/90 bg-slate-50/80 hover:border-blue-400"
        >
          <EChart option={facilityUtilOption} label="Campus zone utilization by building" />
        </ChartCard>

        <ChartCard
          title="Max Unique Choice by Degree"
          badge=""
          badgeClass="bg-purple-50 text-purple-600"
          borderClass="border-slate-200/90 bg-slate-50/80 hover:border-purple-400"
          delay={80}
        >
          <EChart option={uniqueChoiceOption} label="Maximum unique course choice by degree level" />
        </ChartCard>

        <ChartCard
          title="Faculty Teaching Load Compliance"
          badge="sample load"
          badgeClass="bg-emerald-50 text-emerald-600"
          borderClass="border-slate-200/90 bg-slate-50/80 hover:border-emerald-400"
          delay={160}
        >
          <EChart option={facultyLoadOption} label="Faculty teaching load compliance by department" />
        </ChartCard>

        <ChartCard
          title="Faculty Preference Match Breakdown"
          badge="100.0% Match Index"
          badgeClass="bg-purple-50 text-purple-600"
          borderClass="border-slate-200/90 bg-slate-50/80 hover:border-purple-400"
          delay={240}
        >
          <EChart option={facultyPrefRadarOption} label="Faculty preference match radar" />
        </ChartCard>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col items-start justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Table className="h-4 w-4 text-blue-600" />
            <span className="font-bold">University Master Schedule Extract (Fall 2026)</span>
          </div>
          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-600">
            Multi-Dimensional View: Dept • Building • Day • Week • Time Window
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-2.5 text-xs sm:grid-cols-5">
          {(
            [
              ["dept", "By Department", EXTRACT_FILTERS.dept],
              ["building", "By Building", EXTRACT_FILTERS.building],
              ["day", "By Day", EXTRACT_FILTERS.day],
              ["week", "By Week", EXTRACT_FILTERS.week],
              ["time", "Any Time of Week", EXTRACT_FILTERS.time],
            ] as const
          ).map(([key, label, options]) => (
            <div key={key}>
              <label
                htmlFor={`filter-${key}`}
                className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500"
              >
                {label}
              </label>
              <select
                id={`filter-${key}`}
                value={filters[key]}
                onChange={(e) => setFilter(key, e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs font-medium focus:ring-1 focus:ring-blue-500"
              >
                {options.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="max-h-52 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="p-2.5">Course &amp; Dept</th>
                <th className="p-2.5">Faculty (Load)</th>
                <th className="p-2.5">Facility / Building</th>
                <th className="p-2.5">Day &amp; Time Window</th>
                <th className="p-2.5">Week Schedule</th>
                <th className="p-2.5 text-right">Proof Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50">
                  <td className="p-2.5 font-bold text-slate-900">
                    {row.code} {row.title}{" "}
                    <span
                      className={`rounded border px-1 py-0.5 font-mono text-[9.5px] ${DEPT_BADGE[row.deptTone]}`}
                    >
                      {row.dept}
                    </span>
                  </td>
                  <td className="p-2.5">
                    {row.instructor} <span className="text-[10px] text-emerald-600">(100% Load)</span>
                  </td>
                  <td className="p-2.5">{row.room}</td>
                  <td className="p-2.5 font-mono text-[11px]">
                    {row.slot} <span className={`rounded px-1.5 py-0.5 ${SLOT_BADGE[row.slotTag]}`}>{row.slotTag}</span>
                  </td>
                  <td className="p-2.5 font-mono text-[10px] text-slate-500">{row.weeks}</td>
                  <td className="p-2.5 text-right">
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ZERO CONFLICT
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-[11px] text-slate-500">
                    No sections match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InstructorView() {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600 text-sm font-bold text-white shadow-sm">
            PC
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Prof. H. Chen — Computer Science Department
            </h4>
            <p className="text-xs font-medium text-purple-700">
              100% Teaching Load Met (12.0 / 12.0 Credits) • 100% Schedule Preference
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-purple-900">
            <Sliders className="h-4 w-4 text-purple-600" />
            <span>Professor Schedule Preference Summary &amp; Personal Constraints</span>
          </div>
          <span className="shrink-0 rounded bg-purple-200 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-800">
            100.0% Match Verified
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 pt-1 text-[11px] text-slate-700 sm:grid-cols-2">
          <div className="rounded-lg border border-purple-100 bg-white p-2.5">
            <span className="mb-1 block font-bold text-purple-900">Teaching &amp; Days Preferences:</span>
            <ul className="space-y-1">
              {INSTRUCTOR_PREFERENCES.teaching.map(([label, value]) => (
                <li key={label}>
                  • <strong>{label}</strong> {value}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-purple-100 bg-white p-2.5">
            <span className="mb-1 block font-bold text-purple-900">Personal Hard Constraints:</span>
            <ul className="space-y-1">
              {INSTRUCTOR_PREFERENCES.personal.map(([label, value]) => (
                <li key={label}>
                  • <strong>{label}</strong> {value}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
        <ChartCard
          title="Max class size"
          badge="12 / 12 (100%)"
          badgeClass="bg-purple-100 text-purple-700"
          borderClass="border-purple-200/80 bg-purple-50/50 hover:border-purple-400"
        >
          <EChart option={instructorLoadOption} className="h-44 w-full" label="Teaching credit load per course" />
        </ChartCard>

        <ChartCard
          title="Faculty Schedule Preference Match Breakdown"
          badge="100.0% Match"
          badgeClass="bg-purple-100 text-purple-700"
          borderClass="border-purple-200/80 bg-purple-50/50 hover:border-purple-400"
          delay={100}
        >
          <EChart option={instructorPrefRadarOption} className="h-44 w-full" label="Faculty preference match radar" />
        </ChartCard>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="text-xs font-bold text-slate-700">
          Assigned Sections &amp; Facility Equipment Readiness:
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {INSTRUCTOR_SECTIONS.map((section) => (
            <div
              key={section.code}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-blue-300"
            >
              <div className="font-bold text-blue-700">
                {section.code} - {section.title} ({section.credits})
              </div>
              <div className="mt-1 font-mono text-slate-600">{section.slot}</div>
              <div className="mt-1 text-[10px] font-bold text-emerald-600">✓ {section.equipment}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StudentView() {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-sm">
            CS
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              CS Senior Cohort — Degree Map &amp; Schedule Optimization
            </h4>
            <p className="text-xs font-medium text-emerald-700">
              4-Course Guarantee Active • Mandatory vs Optional Elective Alignment
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 sm:block">
          Graduation On Track (100%)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
        <ChartCard
          title="Degree Map Requirement Breakdown"
          badge="3 Core • 1 Elective Choice"
          badgeClass="bg-emerald-100 text-emerald-700"
          borderClass="border-emerald-200/80 bg-emerald-50/50 hover:border-emerald-400"
        >
          <EChart option={studentDegreeOption} className="h-44 w-full" label="Degree map requirement breakdown" />
        </ChartCard>

        <ChartCard
          title="Working Professional Schedule Compatibility"
          badge="18:30+ Evening Track Fit"
          badgeClass="bg-purple-100 text-purple-700"
          borderClass="border-emerald-200/80 bg-emerald-50/50 hover:border-emerald-400"
          delay={100}
        >
          <EChart option={studentWorkOption} className="h-44 w-full" label="Working professional schedule compatibility" />
        </ChartCard>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="text-xs font-bold text-slate-700">
          Guaranteed Conflict-Free Class Schedule (Mandatory &amp; Elective Choice):
        </div>
        <div className="space-y-1.5 text-xs">
          {STUDENT_COURSES.map((course) => (
            <div
              key={course.code}
              className={`flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 transition-colors ${
                course.kind === "elective" ? "hover:bg-purple-50/40" : "hover:bg-emerald-50/30"
              }`}
            >
              <div>
                <strong className="text-slate-900">
                  {course.code} {course.title}
                </strong>{" "}
                <span className="font-mono text-slate-500">({course.slot})</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ${
                    course.kind === "core" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {course.kind === "core" ? "Mandatory Core" : "Degree Elective Choice"}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    course.kind === "core"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {course.note}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PreviewColumn({
  persona,
  onPersonaChange,
  mode,
  onModeChange,
  onInspect,
  onOpenAnalytics,
  onToast,
}: {
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onInspect: (key: string) => void;
  onOpenAnalytics: () => void;
  onToast: (message: string) => void;
}) {
  const [rendering, setRendering] = useState(false);

  function transition(run: () => void) {
    setRendering(true);
    window.setTimeout(() => {
      run();
      window.setTimeout(() => setRendering(false), 120);
    }, 120);
  }

  const roleTab = (id: Persona, label: string, Icon: typeof Building2, iconTone?: string) => {
    const active = persona === id;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) return;
          transition(() => onPersonaChange(id));
        }}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 transition-all ${
          active ? "bg-white font-bold text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? "" : (iconTone ?? "")}`} />
        <span>{label}</span>
      </button>
    );
  };

  const modeTab = (id: CanvasMode, label: string, Icon: typeof Table) => {
    const active = mode === id;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) return;
          transition(() => onModeChange(id));
        }}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-all ${
          active ? "bg-blue-50 font-bold text-blue-700" : "font-medium text-slate-600 hover:text-slate-900"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col justify-between space-y-4 lg:pl-2">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 shadow-xs">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          <span>Interactive Platform Preview</span>
        </div>

        <h1 className="text-3xl font-black leading-[1.12] tracking-tight text-slate-900 sm:text-4xl">
          Proven outputs for <br className="hidden sm:block" />
          <span className="gradient-text">every campus role.</span>
        </h1>
        <p className="pt-0.5 text-xs font-medium text-slate-500">
          ✦ Illustrative sample — sign in for the live institution model and solver results.
        </p>
      </div>

      <div className="flex flex-grow flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-ultra">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/90 bg-slate-100/90 px-4 py-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="flex items-center gap-1.5 border-l border-slate-300 pl-2 font-mono text-[11px] text-slate-400">
              <Lock className="h-3 w-3 text-slate-400" /> app.schedulesolve.ai / live-preview
            </span>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
              Illustrative sample preview
            </span>
          </div>
        </div>

        <div className="flex flex-grow flex-col justify-between space-y-4 bg-slate-50/40 p-4 sm:p-5">
          <div className="space-y-3">
            <div className="flex flex-col items-stretch justify-between gap-2 rounded-2xl bg-slate-200/70 p-1.5 shadow-inner sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-1 text-xs font-semibold">
                {roleTab("coordinator", "Admin Deliverable", Building2)}
                {roleTab("instructor", "Instructor View", UserCheck, "text-purple-600")}
                {roleTab("student", "Student Track", GraduationCap, "text-emerald-600")}
              </div>

              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
                {modeTab("table", "Table + ECharts", Table)}
                {modeTab("calendar", "Calendar Matrix", Calendar)}
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[500px] flex-grow flex-col justify-between space-y-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <div
              aria-hidden={!rendering}
              className={`absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-xs transition-opacity duration-200 ${
                rendering ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 font-mono text-xs text-white shadow-xl">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                <span>Rendering Vector Visualizations...</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    Sample Deliverable
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {mode === "calendar" ? CALENDAR_TITLE : TITLES[persona]}
                </h3>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 100% Satisfied
              </span>
            </div>

            <div className="flex flex-grow flex-col justify-center">
              <div key={`${persona}-${mode}`} className="animate-chart-card w-full">
                {mode === "calendar" ? (
                  <CampusMatrix onToast={onToast} />
                ) : persona === "coordinator" ? (
                  <CoordinatorView onInspect={onInspect} onToast={onToast} />
                ) : persona === "instructor" ? (
                  <InstructorView />
                ) : (
                  <StudentView />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
              {persona === "instructor" && mode === "table" ? (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 font-medium text-purple-900 sm:flex-row sm:items-center">
                  <span className="flex items-center gap-1 font-bold">
                    <Sliders className="h-3.5 w-3.5 text-purple-600" /> Preference Summary:
                  </span>
                  <span className="font-mono text-[11px] text-purple-800">
                    Courses: CS101, CS241, CS401 • Days: T, Th • Childcare: M, F • Meditation: 08:00-10:00
                  </span>
                </div>
              ) : (
                <div className="font-medium text-slate-500">
                  System Status:{" "}
                  <strong className="font-mono text-slate-800">
                    {mode === "calendar"
                      ? `4 Quads • ${CAMPUS_TOTALS.buildings} Buildings • ${CAMPUS_TOTALS.rooms} Rooms • ${CAMPUS_TOTALS.seats.toLocaleString()} Seats`
                      : "101 Sections Conflict-Free (sample) • hard constraints enforced"}
                  </strong>
                </div>
              )}

              <button
                type="button"
                onClick={onOpenAnalytics}
                className="flex shrink-0 items-center gap-1 font-bold text-blue-600 hover:text-blue-700 hover:underline"
              >
                <span className="hidden sm:inline">Open Analytics Workspace</span>
                <span className="sm:hidden">Analytics</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { value: "101", tone: "group-hover:text-blue-600", label: "Sections in the sample institution" },
          { value: "2", tone: "text-blue-600", label: "CP-SAT + native engines" },
          { value: "100%", tone: "text-emerald-600", label: "Cohort 4-course safety guarantee" },
        ].map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => {
              onModeChange("table");
              onToast("Previewing the master timetable extract");
            }}
            className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all hover:border-slate-300 hover:shadow-md"
          >
            <div
              className={`inline-block font-mono text-2xl font-extrabold tracking-tight transition-all group-hover:scale-105 sm:text-3xl ${
                stat.tone.startsWith("group") ? `text-slate-900 ${stat.tone}` : stat.tone
              }`}
            >
              {stat.value}
            </div>
            <p className="mt-1 text-xs font-medium leading-snug text-slate-600">{stat.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
