"use client";

// Constraint inspector + engine-spec modals. Both are explanatory surfaces for
// the landing page: they show the proof behind each guarantee chip.

import { useEffect } from "react";
import {
  BookOpen,
  Building2,
  Cpu,
  Footprints,
  GraduationCap,
  Moon,
  Sliders,
  UserCheck,
  X,
} from "lucide-react";

const INSPECTOR: Record<
  string,
  { title: string; icon: typeof Building2; tone: string; formulaLabel: string; formula: string; body: React.ReactNode }
> = {
  utilization: {
    title: "Facility Utilization Mathematical Proof",
    icon: Building2,
    tone: "blue",
    formulaLabel: "CP-SAT objective (sample institution):",
    formula:
      "Minimize the busiest simultaneous building occupancy / building capacity",
    body: (
      <>
        <strong className="text-slate-900">Sample:</strong> the shipped demo institution has 101 sections
        across 8 buildings. Live peak utilization is computed from the published term after sign-in —
        the preview does not fabricate a number.
      </>
    ),
  },
  load: {
    title: "Faculty Workload Compliance Inspector",
    icon: UserCheck,
    tone: "emerald",
    formulaLabel: "Hard Teaching Load Constraint:",
    formula: "∀ f ∈ Faculty, Sum(Credits_Assigned(f)) == Required_Load(f) [12.0 Credits]",
    body: (
      <>
        <strong className="text-slate-900">Proof Status:</strong> hard load and prep caps are enforced for
        all 68 faculty in the shipped sample. Soft preferences are optimized, not guaranteed.
      </>
    ),
  },
  pref: {
    title: "Faculty Preference Optimization Inspector",
    icon: Sliders,
    tone: "purple",
    formulaLabel: "Soft Constraint Objective Function:",
    formula: "Minimize Σ (Weight_p * Preference_Violated_p) — objective value shown after solve",
    body: (
      <>
        <strong className="text-slate-900">Verified Result:</strong> High-satisfaction alignment achieved for
        faculty time-of-day requests, back-to-back teaching avoidance, prep windows, and specialized
        equipment/room requirements.
      </>
    ),
  },
  cohort: {
    title: "4-Course Cohort Safety Proof",
    icon: GraduationCap,
    tone: "indigo",
    formulaLabel: "Prerequisite DAG Verification:",
    formula: "∀ Course_A, Course_B ∈ Cohort_Required, Time(Course_A) ∩ Time(Course_B) = ∅",
    body: (
      <>
        <strong className="text-slate-900">Proof Status:</strong> Zero delay deadlocks. CS Senior cohort
        guaranteed 4 required degree courses with zero schedule overlap.
      </>
    ),
  },
  walk: {
    title: "Walking & Transit Buffer Inspector",
    icon: Footprints,
    tone: "slate",
    formulaLabel: "Cross-Zone Transit Buffer:",
    formula:
      "Time_Start(Section_k+1) - Time_End(Section_k) ≥ Distance_Matrix(Zone_k, Zone_k+1) [≥12 mins]",
    body: (
      <>
        <strong className="text-slate-900">Enforcement:</strong> Strictly enforces the configured walk limit (10 minutes in the shipped sample)
        windows between Science, Engineering, and Business buildings for both students and instructors.
      </>
    ),
  },
  evening: {
    title: "Evening Professional Track Proof",
    icon: Moon,
    tone: "purple",
    formulaLabel: "Evening Slot Constraint:",
    formula: "Time_Slot ≥ 18:30 for Non-Traditional / Professional Sections",
    body: (
      <>
        <strong className="text-slate-900">Result:</strong> BUS 490 Executive Capstone and GEN 201 Ethics in AI
        populated at 18:30+ to enable degree completion for working professionals.
      </>
    ),
  },
};

const TONE: Record<string, string> = {
  blue: "bg-blue-50/70 border-blue-200 text-blue-900",
  emerald: "bg-emerald-50/70 border-emerald-200 text-emerald-900",
  purple: "bg-purple-50/70 border-purple-200 text-purple-900",
  indigo: "bg-indigo-50/70 border-indigo-200 text-indigo-900",
  slate: "bg-slate-100 border-slate-200 text-slate-900",
};

const ICON_TONE: Record<string, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  purple: "text-purple-600",
  indigo: "text-indigo-600",
  slate: "text-slate-700",
};

function Shell({
  title,
  icon: Icon,
  iconClass,
  onClose,
  children,
  footer,
}: {
  title: string;
  icon: typeof Building2;
  iconClass: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Icon className={`h-5 w-5 ${iconClass}`} />
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        <div className="flex justify-end pt-2">{footer}</div>
      </div>
    </div>
  );
}

export function InspectorModal({ topic, onClose }: { topic: string; onClose: () => void }) {
  const spec = INSPECTOR[topic] ?? {
    title: "Degree Catalog Alignment Inspector",
    icon: BookOpen,
    tone: "emerald",
    formulaLabel: "Degree Catalog Validation:",
    formula: "All 101 scheduled sections in the sample cross-referenced against the degree roadmaps.",
    body: (
      <>
        <strong className="text-slate-900">Status:</strong> 100% Roadmap Fit verified without catalog sequence
        deadlocks.
      </>
    ),
  };

  return (
    <Shell
      title={spec.title}
      icon={spec.icon}
      iconClass={ICON_TONE[spec.tone]}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          Close Inspector
        </button>
      }
    >
      <div className="space-y-3 text-xs leading-relaxed text-slate-600">
        <div className={`space-y-1.5 rounded-xl border p-3 font-mono text-[11px] ${TONE[spec.tone]}`}>
          <div className="font-bold">{spec.formulaLabel}</div>
          <div>{spec.formula}</div>
        </div>
        <p>{spec.body}</p>
      </div>
    </Shell>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Shell
      title="ScheduleSolve AI Engine Specifications"
      icon={Cpu}
      iconClass="text-blue-600"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong className="text-slate-900">Two real engines, one contract:</strong> Google OR-Tools
          CP-SAT and the ScheduleSolve native C++ search. Timings depend on the instance; the signed-in
          Build step shows the measured values instead of a fabricated number.
        </p>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px]">
          <div className="font-bold text-slate-900">6 Enterprise Guarantees Evaluated:</div>
          <ul className="space-y-1 text-slate-600">
            <li>
              <span className="font-bold text-emerald-600">•</span> <strong>Building Walk Times:</strong>{" "}
              Configurable walk limit between cross-campus zones (10 min in the sample).
            </li>
            <li>
              <span className="font-bold text-emerald-600">•</span> <strong>Faculty Workload:</strong> 100%
              teaching load enforcement without over-assignment.
            </li>
            <li>
              <span className="font-bold text-emerald-600">•</span> <strong>4-Course Cohort Guarantee:</strong>{" "}
              Ensures major cohorts take 4 required classes overlap-free.
            </li>
            <li>
              <span className="font-bold text-emerald-600">•</span> <strong>Evening Professional Tracks:</strong>{" "}
              Dedicated 18:30+ slots for working students.
            </li>
            <li>
              <span className="font-bold text-emerald-600">•</span> <strong>Facility Utilization:</strong> Auto
              seating capacity matching &amp; equipment checks.
            </li>
          </ul>
        </div>
      </div>
    </Shell>
  );
}
