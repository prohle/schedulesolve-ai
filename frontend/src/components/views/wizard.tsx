"use client";

// Guided wizard — the real end-to-end flow, no toy solver. Every step hits the
// Python backend: Muse Spark parse, CP-SAT solve, the C39/spectral audit, and
// verified term-change reassignment proposals. The default inputs are the demo beats.

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, AlertTriangle, Zap,
  Users, Loader2, CircleCheck, CircleX, Sparkles, Wrench, Radar, Database,
  UploadCloud, FileText, X, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InfoTip, Tip } from "@/components/ui/tip";
import { TimetableGrid, changedSections } from "@/components/timetable-grid";
import { useIntelligence, useScenario } from "@/hooks/use-api";
import {
  DAY_NAMES, PERIOD_NAMES, PATTERN_DAYS,
  type Placement, type CopilotResponse, type TermChangeResponse, type IngestResponse,
  type InstitutionData, type InstitutionConflict, type AgentStep, type CompareResult,
} from "@/types";

interface WizardViewProps {
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

const STEPS = [
  { id: "import", label: "Import", desc: "Point the tool at your data — AI autocleans it", icon: Database },
  { id: "intake", label: "Intake", desc: "Type a constraint → Muse parses it", icon: Users },
  { id: "build", label: "Build", desc: "Run the CP-SAT solver", icon: Zap },
  { id: "review", label: "Review", desc: "C39 audit + spectral radar", icon: ShieldCheck },
  { id: "term-change", label: "Term Change", desc: "Reassignment proposals + re-solve", icon: AlertTriangle },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReviewSection = [string, keyof InstitutionData, (x: any) => string];

const REVIEW_SECTIONS: ReviewSection[] = [
  ["Courses", "courses", (x) => `${x?.code ?? "?"} · ${x?.title ?? ""}`],
  ["Faculty", "instructors", (x) => x?.name ?? "?"],
  ["Cohorts", "cohorts", (x) => `${x?.name ?? "?"} (${x?.size ?? 0})`],
  ["Facilities", "rooms", (x) => `${x?.name ?? "?"} (${x?.capacity ?? 0})`],
  ["Degree map", "degree_map", (x) => `${x?.course ?? "?"} · term ${x?.term ?? "?"}`],
  ["Buildings", "buildings", (x) => x],
];

const SAMPLE_DUMP = `Course catalog:
CS 101 Intro to Programming — MWF, lecture, 50 seats, projector
MATH 201 Calculus I — MWF, lecture, 45 seats, projector
CS 201 Data Structures — MWF, lecture, 45 seats, projector
CS 210 Systems Lab — block, lab, 26 seats, computers
CS 301 Algorithms — MWF, lecture, 26 seats, whiteboard
CS 310 Operating Systems — TTh, lecture, 25 seats, lecture-capture
CS 350 Machine Learning — MWF, lecture, 26 seats
CS 401 Capstone — MWF, seminar, 25 seats, video-conf

Faculty:
Prof. Chen teaches CS 301, CS 310
Prof. Patel teaches CS 101, MATH 201
Prof. Diaz teaches CS 101, MATH 201, CS 201 — unavailable Fridays; prefers mornings
Prof. Okafor teaches CS 201, CS 301, CS 350 (max 3 sections)
Prof. Lee teaches CS 210, CS 401
Prof. Nguyen teaches CS 310, CS 401, CS 301, CS 350

Degree map (BSc Computer Science):
term 1: CS 101 (required)
term 3: CS 201 (required), MATH 201 (required)
term 5: CS 210 (required), CS 301 (required), CS 350 (elective)
term 7: CS 310 (required), CS 401 (required)

Cohorts:
CS 2026 (class of 2030), term 1, 50 students
CS 2025 (class of 2029), term 3, 45 students
CS 2024 (class of 2028), term 5, 26 students
CS 2023 (class of 2027), term 7, 25 students

Rooms:
Science Hall 120 — 120 seats, lecture, projector, lecture-capture
Science 101 — 36 seats, lecture, whiteboard
Science 102 — 40 seats, lecture
Science Lab 1 — 30 seats, lab, computers
Engineering 201 — 45 seats, lecture, projector
Engineering Lab 2 — 28 seats, lab, computers
Library Seminar — 30 seats, seminar, video-conf

Campus map:
Science, Engineering, Library
Science to Engineering: 8 min
Science to Library: 6 min
Engineering to Library: 9 min`;

function placementSlot(p: Placement): string {
  if (p.period != null) {
    const pattern = PATTERN_DAYS.MWF.includes(p.days[0]) && p.days.length === 3 ? "MWF" : "TTh";
    return `${pattern} @${PERIOD_NAMES[p.period]}`;
  }
  const day = DAY_NAMES[p.days[0]]?.slice(0, 3) ?? "?";
  return `${day} @${PERIOD_NAMES[p.periods[0]]}-${PERIOD_NAMES[p.periods[1] ?? p.periods[0]]}`;
}

function PlacementsTable({ placements, dense }: { placements: Placement[]; dense?: boolean }) {
  return (
    <div className="overflow-x-auto border border-border rounded-xl">
      <table className="w-full min-w-[540px] text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-1.5 font-semibold">Course</th>
            <th className="text-left px-3 py-1.5 font-semibold">Instructor</th>
            <th className="text-left px-3 py-1.5 font-semibold">Room</th>
            <th className="text-left px-3 py-1.5 font-semibold">Slot</th>
            <th className="text-right px-3 py-1.5 font-semibold">Length</th>
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => (
            <tr key={p.section_id} className="border-t border-border">
              <td className={cn("px-3 py-1.5 font-semibold text-foreground", dense && "py-1")}>{p.course_code}</td>
              <td className={cn("px-3 py-1.5 text-muted-foreground", dense && "py-1")}>{p.instructor_name}</td>
              <td className={cn("px-3 py-1.5 text-muted-foreground", dense && "py-1")}>{p.room_name} <span className="text-[10px]">[{p.building_id}]</span></td>
              <td className={cn("px-3 py-1.5 font-mono text-muted-foreground", dense && "py-1")}>{placementSlot(p)}</td>
              <td className={cn("px-3 py-1.5 text-right font-mono text-muted-foreground", dense && "py-1")}>{p.duration ?? 1.5}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, icon, hint, children, tone = "default" }: {
  title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode;
  tone?: "default" | "primary" | "emerald" | "amber" | "sky";
}) {
  const tones = {
    default: "bg-card border-border", primary: "bg-primary/5 border-primary/20",
    emerald: "bg-emerald-50 border-emerald-200", amber: "bg-amber-50 border-amber-200",
    sky: "bg-sky-50 border-sky-200",
  };
  return (
    <section className={cn("elev rounded-2xl border p-3.5 sm:p-4", tones[tone])}>
      <div className="mb-3 flex items-center gap-2">
        <span className="shrink-0 rounded-lg border border-black/5 bg-white/80 p-1.5 shadow-sm">{icon}</span>
        <h3 className="min-w-0 flex-1 truncate font-extrabold text-sm tracking-tight text-foreground">{title}</h3>
        {hint && <InfoTip text={hint} />}
      </div>
      {children}
    </section>
  );
}

function AgentTrace({ steps }: { steps?: AgentStep[] }) {
  if (!steps || steps.length === 0) return null;
  return (
    <Section title="Agent trace" hint="Parse → verify → apply. The model proposes at every step; the solver proves each move before it stands." icon={<ListChecks className="w-5 h-5 text-sky-600" />} tone="sky">
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {s.status === "blocked"
              ? <CircleX className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              : <CircleCheck className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />}
            <span className="font-mono font-semibold shrink-0">{s.step}</span>
            <span className={cn("px-1.5 py-0.5 rounded font-bold uppercase text-[9px] shrink-0",
              s.actor.startsWith("Muse") ? "bg-sky-100 text-sky-800" : "bg-muted")}>
              {s.actor}
            </span>
            <span className="text-muted-foreground">{s.detail}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function WizardView({ onToast }: WizardViewProps) {
  const { margins, spectral, solveResult, setSolveResult, busy, error, runSolve, reload } = useIntelligence();
  const [engine, setEngine] = useState<string>("cpsat");
  const [lastEngine, setLastEngine] = useState<string>("cpsat");
  const [engineList, setEngineList] = useState<{ id: string; label: string; kind?: string; description: string }[]>([
    { id: "cpsat", label: "OR-Tools CP-SAT", kind: "industrial", description: "Google's C++ constraint solver — proven optima in milliseconds." },
    { id: "ours", label: "ScheduleSolve solver (ours)", kind: "ai-crafted", description: "From-scratch pure-Python solver built for this problem." },
    { id: "greedy", label: "Greedy descent (ours, fast)", kind: "ai-crafted", description: "First descent only — shows what the optimization phases buy." },
  ]);
  useEffect(() => {
    fetch("/api/engines")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.engines) && d.engines.length) setEngineList(d.engines); })
      .catch(() => {});
  }, []);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const { scenario: currentScenario, refetch: refetchScenario } = useScenario();
  const [step, setStep] = useState<StepId>("import");
  const [importText, setImportText] = useState(SAMPLE_DUMP);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [edited, setEdited] = useState<InstitutionData | null>(null);
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, string>>({});
  const [intakeMsg, setIntakeMsg] = useState("Prof. Patel can't teach Mondays — committee duty. She'd rather not teach at 8:00.");
  const [speakerId, setSpeakerId] = useState("");
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [copilot, setCopilot] = useState<CopilotResponse | null>(null);
  const [termChangeMsg, setTermChangeMsg] = useState("Prof. Chen will no longer teach this term — who should take over her sections?");
  const [termChangeBusy, setTermChangeBusy] = useState(false);
  const [termChange, setTermChange] = useState<TermChangeResponse | null>(null);
  const [scaleBusy, setScaleBusy] = useState(false);

  const stepOrder: StepId[] = ["import", "intake", "build", "review", "term-change"];
  const currentIndex = stepOrder.indexOf(step);

  const post = async (path: string, body: unknown) =>
    (await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })).json();

  const addFiles = (incoming: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  };

  const handleImportFiles = async () => {
    if (files.length === 0) return;
    setIngestBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f, f.name));
      const r: IngestResponse = await (await fetch("/api/ingest/files", { method: "POST", body: fd })).json();
      setIngest(r);
      setEdited(JSON.parse(JSON.stringify(r.parsed)));
      setResolvedConflicts({});
      if (r.completeness.complete) onToast("All six inputs present — ready to build", "success");
      else onToast(`Missing: ${r.completeness.missing.join(", ")}`, "warning");
      if (r.changes?.summary) {
        onToast(r.changes.unchanged ? "No change detected — this matches the current model" : r.changes.summary,
          r.changes.unchanged ? "info" : "success");
      }
    } finally {
      setIngestBusy(false);
    }
  };

  const handleImport = async () => {
    setIngestBusy(true);
    try {
      const r: IngestResponse = await post("/api/ingest", { text: importText });
      setIngest(r);
      setEdited(JSON.parse(JSON.stringify(r.parsed)));
      setResolvedConflicts({});
      if (r.completeness.complete) onToast("All six inputs present — ready to build", "success");
      else onToast(`Missing: ${r.completeness.missing.join(", ")}`, "warning");
      if (r.changes?.summary) {
        onToast(r.changes.unchanged ? "No change detected — this matches the current model" : r.changes.summary,
          r.changes.unchanged ? "info" : "success");
      }
    } finally {
      setIngestBusy(false);
    }
  };

  const removeEntity = (field: keyof InstitutionData, index: number) => {
    setEdited((prev) => {
      if (!prev) return prev;
      const arr = (prev[field] as unknown[]).filter((_, i) => i !== index);
      return { ...prev, [field]: arr };
    });
  };

  const applyConflict = (conflict: InstitutionConflict, optionKey: string) => {
    setEdited((prev) => {
      if (!prev) return prev;
      const entity = conflict.entity as keyof InstitutionData;
      const keep = optionKey.match(/^keep_(\d+)$/);
      if (keep) {
        const winner = Number(keep[1]);
        const arr = (prev[entity] as unknown[]).filter(
          (_, i) => !conflict.indices.includes(i) || i === winner);
        return { ...prev, [entity]: arr };
      }
      if (optionKey === "drop_requirement") {
        return {
          ...prev,
          degree_map: prev.degree_map.filter((_, i) => !conflict.indices.includes(i)),
        };
      }
      if (optionKey === "drop_cohort") {
        return {
          ...prev,
          cohorts: prev.cohorts.filter((_, i) => !conflict.indices.includes(i)),
        };
      }
      return prev; // keep_requirement / keep_cohort: leave the record in place
    });
    setResolvedConflicts((prev) => ({ ...prev, [conflict.id]: optionKey }));
    const chosen = conflict.options.find((o) => o.key === optionKey);
    onToast(`Conflict resolved: ${chosen?.label ?? optionKey}`, "success");
  };

  const keepAll = () => setEdited(ingest ? JSON.parse(JSON.stringify(ingest.parsed)) : null);

  const removeInvalid = () => {
    setEdited((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        courses: prev.courses.filter((c) => c.code && c.seats > 0),
        instructors: prev.instructors.filter((i) => i.name && i.qualified_courses.length > 0),
        rooms: prev.rooms.filter((r) => r.name && r.capacity > 0),
        cohorts: prev.cohorts.filter((c) => c.name && c.size > 0),
      };
    });
  };

  const localCompleteness = (d: InstitutionData | null) => {
    if (!d) return null;
    const defs: [string, string, keyof InstitutionData][] = [
      ["degree_catalog", "Degree catalog", "courses"],
      ["degree_maps", "Degree maps", "degree_map"],
      ["student_bodies", "Student bodies", "cohorts"],
      ["faculty", "Faculty availability", "instructors"],
      ["facilities", "Facilities", "rooms"],
      ["campus_map", "Campus map", "buildings"],
    ];
    return defs.map(([key, label, field]) => {
      const count = (d[field] as unknown[]).length;
      return { key, label, provided: count > 0, count };
    });
  };

  // Leaving Import: finalize the reviewed (keep/changed) data so the solver
  // builds from exactly what the user kept.
  const goToStep = async (idx: number) => {
    if (idx === currentIndex || idx < 0 || idx >= stepOrder.length) return;
    if (step === "import" && idx > currentIndex && edited) {
      setIngestBusy(true);
      try {
        const r: IngestResponse = await post("/api/ingest/apply", { data: edited });
        setIngest(r);
        setResolvedConflicts({});
        if (r.changes?.summary) {
          onToast(r.changes.unchanged ? "No change detected — the model is unchanged" : r.changes.summary,
            r.changes.unchanged ? "info" : "success");
        }
        // The intelligence panel must reflect the world we just imported,
        // not the seed it loaded when the wizard mounted.
        await reload();
        await refetchScenario();
      } finally {
        setIngestBusy(false);
      }
    }
    setStep(stepOrder[idx]);
  };

  const handleNext = () => goToStep(currentIndex + 1);

  const solveWith = async (eng: string) => {
    setLastEngine(eng);
    setSolveResult(await post("/api/solve", { operations: [], engine: eng }));
  };

  const runCompare = async () => {
    setCompareBusy(true);
    setCompare(null);
    try {
      setCompare(await post("/api/solve/compare", {}));
    } finally {
      setCompareBusy(false);
    }
  };

  const loadScale = async (kind: "department" | "university" | "full-university" | "reset") => {
    setScaleBusy(true);
    try {
      const sc = await post(`/api/scenario/${kind}`, {});
      await reload();
      await refetchScenario();
      // Full-university is the native solver's scale: CP-SAT does not
      // complete it inside its budget, so solve with ours directly.
      if (kind === "full-university") setEngine("ours");
      solveWith(kind === "full-university" ? "ours" : engine);
      const label = kind === "full-university" ? "Full University"
        : kind === "university" ? "University" : "Department";
      onToast(
        kind === "reset"
          ? "Back to the story seed — solving…"
          : `${label} scale loaded — ${sc.instructors?.length ?? "?"} instructors, ${sc.sections?.length ?? "?"} sections, ${sc.cohorts?.length ?? "?"} cohorts. Solving…`,
        "success",
      );
    } finally {
      setScaleBusy(false);
    }
  };

  const handleIntake = async () => {
    setIntakeBusy(true);
    setCopilot(null); // never leave a previous request's proof under a new parse
    try {
      const r: CopilotResponse = await post("/api/copilot", {
        message: intakeMsg,
        speaker_id: speakerId || undefined,
      });
      setCopilot(r);
      if (r.result?.status === "infeasible") {
        onToast("Infeasible — the solver named the conflict and self-healed", "warning");
      } else if (r.applied_operations?.length) {
        // Commit the verified request so Build/Review/Term Change build on it
        // instead of silently reverting to the pre-request world.
        await post("/api/apply", { operations: r.applied_operations });
        await reload();
        onToast("Applied to the term — later steps build on it", "success");
      } else {
        onToast("Muse parsed it; CP-SAT re-solved", "success");
      }
    } finally {
      setIntakeBusy(false);
    }
  };

  const commitTermChange = async (r: TermChangeResponse) => {
    setTermChange(r);
    const rehomed = Object.keys(r.chosen).length;
    const feasible = r.result?.status !== "infeasible";
    if (r.removed_instructor_id && feasible
        && (rehomed > 0 || r.affected_section_ids.length === 0)) {
      // Commit the removal and every verified coverage pick, so a later
      // solve cannot quietly put the absent instructor back on the board.
      await post("/api/apply", {
        pins: r.chosen,
        remove_instructor_id: r.removed_instructor_id,
      });
      await reload();
      onToast(`Term Change applied — ${rehomed} section(s) re-homed`, "success");
    } else {
      onToast(`Term Change analysed — ${rehomed} section(s) re-homed`, "warning");
    }
  };

  const handleTermChange = async () => {
    setTermChangeBusy(true);
    setTermChange(null);
    try {
      await commitTermChange(await post("/api/term-change", { message: termChangeMsg }));
    } finally {
      setTermChangeBusy(false);
    }
  };

  const buildPlacements = solveResult?.timetable?.placements ?? [];
  const intakePlacements = copilot?.result?.timetable?.placements ?? buildPlacements;
  const termChangePlacements = termChange?.result?.timetable?.placements ?? [];
  const termChangeBaseline = buildPlacements.length ? buildPlacements : intakePlacements;
  const termChangeChanged = termChangeBaseline.length && termChangePlacements.length
    ? changedSections(termChangeBaseline, termChangePlacements)
    : undefined;

  return (
    <div className="w-full">
      {/* Step header: tappable steps (desc on hover/tap) + live KPI chips */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 py-0.5" role="tablist" aria-label="Express steps">
          {STEPS.map((s, idx) => {
            const done = idx < currentIndex;
            const active = idx === currentIndex;
            return (
              <div key={s.id} className="flex shrink-0 items-center gap-1">
                <Tip label={s.desc} side="bottom">
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => goToStep(idx)}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.97]",
                      active
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : done
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                          : "bg-muted/60 text-muted-foreground ring-1 ring-transparent hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                      active ? "bg-white/20" : done ? "bg-emerald-500 text-white" : "bg-white ring-1 ring-border"
                    )}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                    </span>
                    <span className={cn(!active && "hidden min-[420px]:inline")}>{s.label}</span>
                  </button>
                </Tip>
                {idx < STEPS.length - 1 && (
                  <div className={cn("h-0.5 w-3 shrink-0 rounded-full sm:w-5", done ? "bg-emerald-400" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Command strip: the institution, the engine, the proof, the guarantee */}
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            {
              label: "Institution",
              value: currentScenario
                ? `${currentScenario.instructors.length} faculty · ${currentScenario.sections.length} sections`
                : "—",
              sub: currentScenario ? `${currentScenario.cohorts.length} cohorts · ${currentScenario.programs.length} programs · ${currentScenario.rooms.length} rooms` : "loading…",
            },
            {
              label: "Engine",
              value: engineList.find((e) => e.id === engine)?.label ?? engine,
              sub: `${engineList.length} registered · plug-and-play`,
            },
            {
              label: "Last proof",
              value: solveResult ? `${solveResult.status.toUpperCase()} · ${solveResult.solve_time_ms} ms` : "Not solved",
              sub: solveResult ? `penalty ${solveResult.objective ?? "—"} · ${engineList.find((e) => e.id === lastEngine)?.label ?? lastEngine}` : "run a solve in Build",
            },
            {
              label: "4-course guarantee",
              value: margins ? `${margins.cohorts.filter((c) => c.ok).length}/${margins.cohorts.length} cohorts` : "—",
              sub: margins ? (margins.all_ok ? "holds for every cohort" : "shortfall — tightener can repair") : "audited in Review",
            },
          ].map((kpi) => (
            <div key={kpi.label} title={`${kpi.value} — ${kpi.sub}`} className="min-w-0 rounded-xl border border-border bg-gradient-to-br from-white to-slate-50 px-2.5 py-2 shadow-sm">
              <div className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">{kpi.label}</div>
              <div className="mt-0.5 truncate text-[13px] leading-tight font-extrabold text-foreground">{kpi.value}</div>
              <div className="truncate text-[10px] text-muted-foreground">{kpi.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4 pb-28">
        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            Backend not reachable — the wizard needs the Python service. Start it with{" "}
            <code className="bg-white px-1 rounded">docker compose up</code> or{" "}
            <code className="bg-white px-1 rounded">./start.sh</code>.
          </div>
        )}

        {step === "import" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <Section title="Your scheduling data" hint="Any format — PDF catalog, Excel rooms, Word memo, CSV, plain text, or a zip. Muse autocleans files covering all six needs (catalog, degree maps, cohorts, faculty, rooms, campus map) into one model of the institution." icon={<Database className="w-5 h-5 text-primary" />} tone="primary">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => document.getElementById("file-input")?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <UploadCloud className="w-6 h-6 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium mt-2">Drop files, or tap to browse</p>
                <p className="text-[11px] text-muted-foreground mt-1">PDF · DOCX · XLSX · CSV · JSON · TXT · ZIP</p>
                <input id="file-input" type="file" multiple className="hidden"
                  accept=".pdf,.docx,.xlsx,.csv,.tsv,.json,.txt,.md,.html,.zip"
                  onChange={(e) => e.target.files && addFiles(e.target.files)} />
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs bg-muted/50 border border-border rounded px-2 py-1">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button variant="primary" size="md" onClick={handleImportFiles} disabled={ingestBusy} className="mt-2 flex items-center gap-2">
                    {ingestBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Process {files.length} file{files.length > 1 ? "s" : ""}
                  </Button>
                </div>
              )}

              <details className="mt-3 text-xs">
                <summary className="text-muted-foreground cursor-pointer">…or paste the data as text</summary>
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} spellCheck={false}
                  className="w-full border border-input rounded-lg p-2 text-[11px] font-mono bg-background mt-2" />
                <Button variant="outline" size="sm" onClick={handleImport} disabled={ingestBusy} className="mt-2">Auto-clean pasted text</Button>
              </details>
            </Section>

            {ingest && edited && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("px-2 py-0.5 rounded font-bold uppercase", ingest.parser_mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-muted")}>
                      {ingest.parser_mode}
                    </span>
                    {ingest.model && <span className="font-mono">{ingest.model}</span>}
                    {ingest.parser_latency_ms != null && <span>{Math.round(ingest.parser_latency_ms / 100) / 10}s</span>}
                    {(() => {
                      const checks = localCompleteness(edited) ?? [];
                      const missing = checks.filter((c) => !c.provided).map((c) => c.label);
                      return missing.length === 0
                        ? <span className="text-emerald-700 font-semibold">Complete — ready to build the schedule</span>
                        : <span className="text-amber-700 font-semibold">Missing {missing.length}: {missing.join(", ")}</span>;
                    })()}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(localCompleteness(edited) ?? []).map((chk) => (
                      <div key={chk.key} className={cn("flex items-center gap-2 border rounded-lg p-2.5", chk.provided ? "bg-emerald-50/40 border-emerald-200" : "bg-amber-50/60 border-amber-200")}>
                        {chk.provided ? <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0" /> : <CircleX className="w-4 h-4 text-amber-600 shrink-0" />}
                        <span className="flex-1">
                          <span className="block text-xs font-medium">{chk.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{chk.provided ? `${chk.count} kept` : "missing"}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {ingest.changes && (
                  <div className={cn(
                    "rounded-xl border p-3 text-xs",
                    ingest.changes.unchanged
                      ? "border-slate-200 bg-slate-50"
                      : "border-sky-200 bg-sky-50",
                  )}>
                    <p className="font-bold text-slate-900">
                      {ingest.changes.unchanged
                        ? "No change detected"
                        : ingest.changes.initial ? "Initial import" : "Recognized change"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{ingest.changes.summary}</p>
                    {ingest.changes.changes.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                        {ingest.changes.changes.slice(0, 6).map((change, i) => (
                          <li key={`${change.entity}-${change.key}-${i}`}>
                            <strong className="capitalize">{change.kind}</strong>{" "}
                            {change.entity} {change.key}
                            {change.detail ? ` — ${change.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {ingest.conflicts && ingest.conflicts.length > 0 && (
                  <Section
                    title="Data conflicts — choose the winner"
                    hint="Muse Spark found records that disagree. Each option names the source it came from; the losing copy is dropped from the model."
                    icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
                    tone="amber"
                  >
                    <div className="space-y-3">
                      {ingest.conflicts.map((conflict) => {
                        const chosen = resolvedConflicts[conflict.id];
                        return (
                          <div key={conflict.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                            <p className="text-xs font-bold text-amber-950">{conflict.summary}</p>
                            {conflict.detail && (
                              <p className="mt-0.5 text-[11px] text-amber-900/80">{conflict.detail}</p>
                            )}
                            <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-900">
                              {conflict.sources.map((source, i) => (
                                <li key={i}>
                                  <span className="font-semibold">Source {i + 1}:</span> {source}
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {conflict.options.map((option) => (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => applyConflict(conflict, option.key)}
                                  className={cn(
                                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                                    chosen === option.key
                                      ? "border-emerald-500 bg-emerald-600 text-white"
                                      : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
                                  )}
                                  title={option.detail}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            {chosen && (
                              <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                                Resolved — this choice is applied when you continue.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                <Section title="Keep what looks right" hint="The solver builds only from what you keep. Tap ✕ on any row to drop it." icon={<ListChecks className="w-5 h-5 text-primary" />} tone="default">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Button variant="outline" size="sm" onClick={keepAll}>Keep all</Button>
                    <Button variant="outline" size="sm" onClick={removeInvalid}>Remove invalid</Button>
                  </div>

                  {[
                    ["Courses", "courses", (x: { code?: string; title?: string }) => `${x.code ?? "?"} · ${x.title ?? ""}`],
                    ["Faculty", "instructors", (x: { name?: string }) => x.name ?? "?"],
                    ["Cohorts", "cohorts", (x: { name?: string; size?: number }) => `${x.name ?? "?"} (${x.size ?? 0})`],
                    ["Facilities", "rooms", (x: { name?: string; capacity?: number }) => `${x.name ?? "?"} (${x.capacity ?? 0})`],
                    ["Degree map", "degree_map", (x: { course?: string; term?: number }) => `${x.course ?? "?"} · term ${x.term ?? "?"}`],
                    ["Buildings", "buildings", (x: string) => x],
                  ].map((row) => {
                    const [label, field, fmt] = row as unknown as ReviewSection;
                    const items = (edited[field as keyof InstitutionData] as unknown[]) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div key={String(label)} className="mb-3 last:mb-0">
                        <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label} ({items.length})</div>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-[11px] font-mono">
                              {fmt(item)}
                              <button onClick={() => removeEntity(field as keyof InstitutionData, i)} className="text-muted-foreground hover:text-destructive" aria-label={`remove ${label}`}>
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </Section>
              </div>
            )}
          </div>
        )}

        {step === "intake" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <Section title="Add a constraint" hint="Type it exactly as you'd say it. Muse parses it into typed constraints; the solver re-solves and proves it before anything changes." icon={<Users className="w-5 h-5 text-primary" />} tone="primary">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="speaker">Speaker</label>
                <select
                  id="speaker"
                  value={speakerId}
                  onChange={(e) => setSpeakerId(e.target.value)}
                  className="min-h-10 border border-input rounded-xl px-2 py-1 text-xs bg-background"
                >
                  <option value="">(chair / not specified)</option>
                  {(ingest?.scenario.instructors ?? currentScenario?.instructors ?? []).map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <InfoTip text="Needed for “I can't…” / “keep me…” requests — tells the parser who is speaking." />
              </div>
              <textarea
                value={intakeMsg}
                onChange={(e) => setIntakeMsg(e.target.value)}
                rows={2}
                className="w-full border border-input rounded-lg p-2 text-sm bg-background"
              />
              <Button variant="primary" size="md" onClick={handleIntake} disabled={intakeBusy} className="mt-3 flex items-center gap-2">
                {intakeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Parse & Re-solve
              </Button>
            </Section>

            {copilot && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("px-2 py-0.5 rounded font-bold uppercase", copilot.parser_mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-muted")}>
                    {copilot.parser_mode}
                  </span>
                  {copilot.model && <span className="font-mono">{copilot.model}</span>}
                  {copilot.parser_latency_ms != null && <span>{Math.round(copilot.parser_latency_ms / 100) / 10}s</span>}
                  {copilot.summary}
                </div>
                {copilot.operations.map((op, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-card border border-border rounded p-2">
                    <CircleCheck className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="font-mono font-semibold">{op.op}</span>
                    <span className="text-muted-foreground">{op.explanation}</span>
                  </div>
                ))}
                {copilot.explanation && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                    <strong>Explanation ({copilot.explanation_mode}):</strong> {copilot.explanation}
                  </div>
                )}
                <AgentTrace steps={copilot.agent_trace} />
                {copilot.options.length > 0 && (
                  <Section title="Verified fixes" hint="Muse proposed each fix; the solver re-solved it. Only proven options show — the least disruptive one was applied to the term." icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />} tone="emerald">
                    <div className="space-y-1.5">
                      {copilot.options.map((o, i) => (
                        <div key={i} className="bg-white border border-emerald-200 rounded p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <CircleCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-semibold">Drop</span>
                            <span className="text-muted-foreground">{o.dropped_explanation}</span>
                            <span className="ml-auto font-mono text-emerald-700">
                              {o.result.status} · penalty {o.result.objective ?? "—"}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 pl-5">{o.tradeoff}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
                {intakePlacements.length > 0 && (
                  <>
                    <TimetableGrid
                      placements={intakePlacements}
                      changed={buildPlacements.length ? changedSections(buildPlacements, intakePlacements) : undefined}
                      compact
                    />
                    <PlacementsTable placements={intakePlacements} dense />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === "build" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <Section title="Build the term" hint="Assigns every section an instructor, time, and room under all hard rules: capacity, loads, cohort conflicts, equipment, walk distance. Pick an engine — same input, same output contract." icon={<Zap className="w-5 h-5 text-emerald-600" />} tone="emerald">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-emerald-900">Engine</span>
                <Button variant="outline" size="sm" onClick={runCompare} disabled={compareBusy} className="ml-auto flex items-center gap-1.5">
                  {compareBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Compare engines
                </Button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 mb-3">
                {engineList.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEngine(e.id)}
                    className={cn("text-left rounded-xl border p-3 transition-all",
                      engine === e.id
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25"
                        : "bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-sm")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold leading-tight">{e.label}</span>
                      <span className={cn("text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded",
                        engine === e.id ? "bg-white/25" : "bg-muted text-muted-foreground")}>
                        {e.kind ?? "engine"}
                      </span>
                    </span>
                    <span className={cn("block text-[10px] leading-snug mt-1",
                      engine === e.id ? "text-emerald-50" : "text-muted-foreground")}>
                      {e.description}
                    </span>
                  </button>
                ))}
              </div>
              <Button variant="primary" size="md" onClick={() => { solveWith(engine); onToast(engine === "ours" ? "Running ScheduleSolve solver…" : "Running CP-SAT…", "info"); }} disabled={busy !== null} className="flex items-center gap-2">
                {busy === "solve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Solve with {engineList.find((e) => e.id === engine)?.label ?? engine}
              </Button>
              {compare && (
                <div className="mt-4 border-t border-emerald-200 pt-3">
                  {compare.verdict && (
                    <div className="bg-emerald-700 text-white rounded p-2.5 text-xs font-semibold mb-3">
                      Ranked on output — status, then penalty, then speed: {compare.verdict}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs mb-3">
                    <div className="bg-white border rounded p-2">
                      <div className="font-bold">{compare.cpsat.status} · {compare.cpsat.solve_time_ms} ms</div>
                      <div className="text-muted-foreground">CP-SAT · penalty {compare.cpsat.objective ?? "—"}</div>
                      <div className={cn("mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        compare.winner === "cpsat" ? "bg-emerald-100 text-emerald-800" : compare.winner === "tie" ? "bg-sky-100 text-sky-800" : "bg-muted")}>
                        {compare.winner === "cpsat" ? "Rank 1" : compare.winner === "tie" ? "Tied 1st" : "Rank 2"}
                      </div>
                    </div>
                    <div className="bg-white border rounded p-2">
                      <div className="font-bold">{compare.ours.status} · {compare.ours.solve_time_ms} ms</div>
                      <div className="text-muted-foreground">Ours · penalty {compare.ours.objective ?? "—"}</div>
                      <div className={cn("mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        compare.winner === "ours" ? "bg-emerald-100 text-emerald-800" : compare.winner === "tie" ? "bg-sky-100 text-sky-800" : "bg-muted")}>
                        {compare.winner === "ours" ? "Rank 1" : compare.winner === "tie" ? "Tied 1st" : "Rank 2"}
                      </div>
                    </div>
                    <div className="bg-white border rounded p-2">
                      <div className="font-bold">{compare.agreement_pct != null ? `${compare.agreement_pct}%` : "—"}</div>
                      <div className="text-muted-foreground">identical placements</div>
                    </div>
                    <div className="bg-white border rounded p-2">
                      <div className="font-bold">{compare.objective_delta != null ? (compare.objective_delta > 0 ? `+${compare.objective_delta}` : compare.objective_delta) : "—"}</div>
                      <div className="text-muted-foreground">penalty delta (ours − CP-SAT)</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-800 mb-2">
                    Differing sections ringed on the right ({compare.differing_sections.length} of {compare.cpsat.timetable?.placements.length ?? 0}).
                  </p>
                  {compare.cpsat.timetable && compare.ours.timetable && (
                    <div className="grid gap-3 2xl:grid-cols-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-muted-foreground mb-1">CP-SAT</div>
                        <TimetableGrid placements={compare.cpsat.timetable.placements} compact />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-700 mb-1">ScheduleSolve solver (ours)</div>
                        <TimetableGrid
                          placements={compare.ours.timetable.placements}
                          changed={changedSections(compare.cpsat.timetable.placements, compare.ours.timetable.placements)}
                          compact
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 border-t border-emerald-200 pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-emerald-900">Try it at scale</span>
                  <InfoTip text="The demo story is one CS department slice. Department = 26 instructors · 25 sections · 12 cohorts. University = 38 instructors · 41 sections · 20 cohorts · 5 programs. Full University = 198 instructors · 361 sections · 100 cohorts · 25 programs · ~12,000 students — the stress scale the native solver completes (CP-SAT exceeds its budget there). Same engines, solved live." />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => loadScale("department")} disabled={scaleBusy} className="flex items-center gap-1.5">
                    {scaleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Department
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadScale("university")} disabled={scaleBusy} className="flex items-center gap-1.5">
                    {scaleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    University
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadScale("full-university")} disabled={scaleBusy} className="flex items-center gap-1.5">
                    {scaleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Full University
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadScale("reset")} disabled={scaleBusy}>
                    Story seed
                  </Button>
                </div>
              </div>
            </Section>
            {solveResult && solveResult.status !== "infeasible" && (
              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                <span className="font-bold text-emerald-600">{solveResult.status.toUpperCase()}</span>
                <span>{engineList.find((e) => e.id === lastEngine)?.label ?? lastEngine}</span>
                <span>{solveResult.solve_time_ms} ms</span>
                <span>penalty {solveResult.objective ?? "—"}</span>
              </div>
            )}
            {buildPlacements.length > 0 && <TimetableGrid placements={buildPlacements} />}
            {buildPlacements.length > 0 && <PlacementsTable placements={buildPlacements} />}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            {spectral && (
              <Section title="Spectral radar" hint="Conflict-graph health check. μ₂ = how tightly sections are coupled; Hoffman bound = minimum time bands needed; max clique = largest set of mutually conflicting sections. Warnings flag structural deadlocks before a solve is wasted." icon={<Radar className="w-5 h-5 text-sky-600" />} tone="sky">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white border rounded p-2">
                    <div className="font-bold text-foreground">{spectral.algebraic_connectivity.toFixed(3)}</div>
                    <div className="text-muted-foreground">connectivity μ₂</div>
                  </div>
                  <div className="bg-white border rounded p-2">
                    <div className="font-bold text-foreground">χ ≥ {spectral.hoffman_chromatic_lower_bound}</div>
                    <div className="text-muted-foreground">Hoffman bound</div>
                  </div>
                  <div className="bg-white border rounded p-2">
                    <div className="font-bold text-foreground">{spectral.max_clique.length}</div>
                    <div className="text-muted-foreground">max clique</div>
                  </div>
                </div>
                {spectral.deadlock_warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {spectral.deadlock_warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5">{w}</li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {margins && (
              <Section title={`4-course guarantee · min ${margins.min_courses}`} hint="Every cohort must be able to fit at least this many distinct, non-overlapping courses toward graduation. Amber = shortfall the tightener can repair." icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />} tone="emerald">
                <div className="space-y-2">
                  {margins.cohorts.map((m) => (
                    <div key={m.cohort_id} className={cn("border rounded-lg p-2.5", m.ok ? "bg-white border-emerald-200" : "bg-amber-50 border-amber-200")}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{m.name}</span>
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded", m.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                          {m.margin} / {margins.min_courses}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.example_track.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{c}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {step === "term-change" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <Section title="Term Change" hint="A change that lasts through the end of the term — an instructor will no longer teach, so their sections are reassigned for the rest of the term. The solver probes every qualified instructor and ranks only zero-ripple reassignments; no name is shown until the reassignment is proven. A room change for the rest of the term (e.g. a hall withdrawn) is entered in Intake instead." icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} tone="amber">
              <textarea
                value={termChangeMsg}
                onChange={(e) => setTermChangeMsg(e.target.value)}
                rows={2}
                className="w-full border border-input rounded-lg p-2 text-sm bg-background"
              />
<Button variant="primary" size="md" onClick={handleTermChange} disabled={termChangeBusy} className="mt-3 flex items-center gap-2">
                {termChangeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                Apply Term Change
              </Button>
            </Section>

            {termChange && (
              <>
                <div className="text-xs text-muted-foreground">
                  {termChange.removed_instructor_name ? `${termChange.removed_instructor_name} removed` : "No instructor identified"} — {termChange.affected_section_ids.length} section(s) affected
                  {termChange.parser_mode === "muse-spark"
                    ? ` · live Muse Spark${termChange.model ? ` (${termChange.model})` : ""}${termChange.parser_latency_ms != null ? ` · ${Math.round(termChange.parser_latency_ms / 100) / 10}s` : ""}`
                    : " · mock parser"}
                </div>
                {termChange.transcript && (
                  <div className="text-xs bg-sky-50 border border-sky-200 text-sky-900 rounded p-2">
                    <strong>Heard:</strong> “{termChange.transcript}”
                  </div>
                )}
                <AgentTrace steps={termChange.agent_trace} />
                {termChange.proposals.map((p, i) => (
                  <div key={i} className={cn("flex items-center gap-2 text-xs border rounded p-2", p.feasible ? "bg-white border-emerald-200" : "bg-muted/40 border-border")}>
                    {p.feasible ? <CircleCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <CircleX className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="font-semibold">{p.course_code}</span>
                    <span>→ {p.instructor_name}</span>
                    <span className="text-muted-foreground flex-1">{p.reason}</span>
                  </div>
                ))}
                {termChangePlacements.length > 0 && (
                  <div className="space-y-3">
                    <div className="grid gap-3 2xl:grid-cols-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-muted-foreground mb-1">Before</div>
                        <TimetableGrid placements={termChangeBaseline} compact />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-amber-700 mb-1">After — verified reassignment</div>
                        <TimetableGrid placements={termChangePlacements} changed={termChangeChanged} compact />
                      </div>
                    </div>
                    <PlacementsTable placements={termChangePlacements} dense />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer nav — floats above content (and above the mobile tab bar) */}
      <div className="glass sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-30 mt-4 flex items-center justify-between gap-2 rounded-2xl border border-border px-2.5 py-2 shadow-lg shadow-slate-900/5 lg:bottom-3">
        <Button variant="outline" size="md" onClick={() => setStep(stepOrder[Math.max(0, currentIndex - 1)])} disabled={currentIndex === 0}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          {currentIndex + 1} / {STEPS.length} · <span className="font-semibold text-foreground">{STEPS[currentIndex].label}</span>
        </span>
        {currentIndex < stepOrder.length - 1 ? (
          <Button variant="primary" size="md" onClick={handleNext} disabled={ingestBusy}>
            {ingestBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={() => onToast("Schedule stable — audit trail recorded", "success")}>
            Done <CheckCircle2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}