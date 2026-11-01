"use client";

// Schedule: the published timetable filtered to the signed-in user.
// - instructor: own sections + a structured intake grid (hard off-time,
//   soft preferences, load caps) and a free-text note. Every submission —
//   picked or typed — waits for the coordinator; applying verifies it with
//   the solver and re-publishes. Picked operations are verified exactly.
// - student: the cohort's courses this term, read-only
// - coordinator: full timetable, Publish, term closures (holidays), and
//   the decision queue with each requester's current load vs cap.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, GraduationCap, LayoutGrid, Loader2, Minus, Plus, Send, Sparkles, X } from "lucide-react";
import { authFetch, type AuthUser } from "@/lib/auth";
import { TimetableGrid } from "@/components/timetable-grid";
import { CampusMatrix } from "@/components/landing/campus-matrix";
import { buildLiveCampus } from "@/lib/campus-live";
import { InfoTip } from "@/components/ui/tip";
import { useScenario } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { DAY_NAMES, PERIOD_NAMES, type IntakeOperation, type Placement, type StudentPlanResponse, type TermClosure } from "@/types";

interface InstructorLoad {
  current: number;
  preps: number;
  max_sections: number;
  max_preps: number;
  hard_unavailable: { day: number; period: number }[];
  preferences: { kind: string; day?: number | null; period?: number | null }[];
}

interface MineResponse {
  role: string;
  scope: string;
  status: string;
  objective: number | null;
  placements: Placement[];
  load?: InstructorLoad | null;
}

interface ChangeRequest {
  id: number;
  instructor_id?: string | null;
  requester?: string;
  message: string;
  operations?: IntakeOperation[] | null;
  kind?: string;
  load?: { current: number; max_sections?: number | null } | null;
  status: string;
  result_summary?: string | null;
  created_at?: string | null;
}

/* ---------------- per-professor structured intake ---------------- */

const CELL_WORD = ["", "Prefer", "Avoid", "Off"];
const CELL_CLASS = [
  "bg-muted/50 text-muted-foreground/60 ring-border hover:bg-muted",
  "bg-emerald-100 text-emerald-800 ring-emerald-300",
  "bg-amber-100 text-amber-800 ring-amber-300",
  "bg-slate-700 text-white ring-slate-700",
];

function buildIntakeOps(cells: Record<string, number>, name: string): IntakeOperation[] {
  const ops: IntakeOperation[] = [];
  const kinds: [number, () => { op: string; kind?: string; weight?: number }, (scope: string) => string][] = [
    [3, () => ({ op: "add_instructor_unavailability" }), (s) => `${name} can't teach ${s}.`],
    [2, () => ({ op: "add_instructor_preference", kind: "avoid", weight: 8 }), (s) => `${name} avoids ${s}.`],
    [1, () => ({ op: "add_instructor_preference", kind: "prefer", weight: 8 }), (s) => `${name} prefers ${s}.`],
  ];
  for (const [state, make, say] of kinds) {
    for (let day = 0; day < 5; day++) {
      const picked = [0, 1, 2, 3].filter((p) => (cells[`${day}-${p}`] ?? 0) === state);
      if (picked.length === 4) {
        ops.push({ ...make(), day, explanation: say(`on ${DAY_NAMES[day]}s`) });
      } else {
        for (const p of picked) {
          ops.push({ ...make(), day, period: p, explanation: say(`${DAY_NAMES[day]} ${PERIOD_NAMES[p]}`) });
        }
      }
    }
  }
  return ops;
}

function IntakePanel({ user, load, busy, onSend }: {
  user: AuthUser;
  load?: InstructorLoad | null;
  busy: boolean;
  onSend: (operations: IntakeOperation[], note: string) => void;
}) {
  const [cells, setCells] = useState<Record<string, number>>({});
  const [brush, setBrush] = useState(3);
  const [note, setNote] = useState("");
  const [maxSections, setMaxSections] = useState(3);
  const [maxPreps, setMaxPreps] = useState(2);
  const [loadTouched, setLoadTouched] = useState(false);
  const prefilled = useRef(false);

  // Start from the constraints already on the term, so editing is incremental.
  useEffect(() => {
    if (!load || prefilled.current) return;
    prefilled.current = true;
    const next: Record<string, number> = {};
    for (const s of load.hard_unavailable) next[`${s.day}-${s.period}`] = 3;
    for (const p of load.preferences) {
      const v = p.kind === "avoid" ? 2 : 1;
      if (p.period != null && p.day != null) next[`${p.day}-${p.period}`] = v;
      else if (p.day != null) for (let per = 0; per < 4; per++) next[`${p.day}-${per}`] ||= v;
      else if (p.period != null) for (let d = 0; d < 5; d++) next[`${d}-${p.period}`] ||= v;
    }
    setCells(next);
    setMaxSections(load.max_sections);
    setMaxPreps(load.max_preps);
  }, [load]);

  const ops = buildIntakeOps(cells, user.display_name);
  if (loadTouched && load) {
    if (maxSections !== load.max_sections)
      ops.push({ op: "set_load_cap", value: maxSections, explanation: `${user.display_name} can teach up to ${maxSections} sections.` });
    if (maxPreps !== load.max_preps)
      ops.push({ op: "set_prep_cap", value: maxPreps, explanation: `${user.display_name} caps distinct courses at ${maxPreps}.` });
  }
  const paint = (day: number, period: number) =>
    setCells((prev) => ({ ...prev, [`${day}-${period}`]: brush }));

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-xs font-bold tracking-wide uppercase">My intake — availability & load</h3>
        <InfoTip text="Tap cells with a brush: Off = hard constraint (never scheduled), Avoid/Prefer = soft (the solver pays a penalty to violate them). Pick your teaching load too. The coordinator approves; the solver verifies your exact picks before anything changes." />
        {load && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
            Now: {load.current}/{load.max_sections} sections · {load.preps} course{load.preps === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded-xl ring-1 ring-border" role="group" aria-label="Brush">
          {CELL_WORD.map((w, i) => i > 0 && (
            <button key={w} onClick={() => setBrush(i)}
              className={cn("min-h-9 px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                brush === i ? CELL_CLASS[i] + " ring-2 ring-inset ring-primary/50" : "bg-card text-muted-foreground hover:bg-muted")}>
              {w}
            </button>
          ))}
          <button onClick={() => setBrush(0)}
            className={cn("min-h-9 px-2.5 py-1.5 text-[11px] font-bold",
              brush === 0 ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
            Erase
          </button>
        </div>
        <button onClick={() => setCells((p) => ({ ...p, ...Object.fromEntries([0, 1, 2, 3].map((per) => [`4-${per}`, 3])) }))}
          className="min-h-9 rounded-xl bg-muted px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-border transition-all active:scale-[0.97]">
          No Fridays
        </button>
        <button onClick={() => setCells((p) => {
          const n = { ...p };
          for (let d = 0; d < 5; d++) for (const per of [0, 1]) if (!n[`${d}-${per}`]) n[`${d}-${per}`] = 1;
          return n;
        })} className="min-h-9 rounded-xl bg-muted px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-border transition-all active:scale-[0.97]">
          Prefer mornings
        </button>
        <button onClick={() => setCells({})}
          className="min-h-9 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-muted-foreground underline underline-offset-2">
          Clear
        </button>
      </div>

      <div className="grid grid-cols-[2.2rem_repeat(4,minmax(0,1fr))] gap-1">
        <span />
        {PERIOD_NAMES.map((p) => (
          <span key={p} className="pb-0.5 text-center text-[10px] font-bold text-muted-foreground">{p}</span>
        ))}
        {DAY_NAMES.map((day, d) => (
          <Fragment key={day}>
            <span className="flex items-center text-[10px] font-bold text-muted-foreground">{day.slice(0, 3)}</span>
            {[0, 1, 2, 3].map((p) => {
              const v = cells[`${d}-${p}`] ?? 0;
              return (
                <button key={`${d}-${p}`} onClick={() => paint(d, p)}
                  aria-label={`${day} ${PERIOD_NAMES[p]}: ${CELL_WORD[v] || "available"}`}
                  className={cn("min-h-10 rounded-lg text-[10px] font-bold ring-1 transition-all active:scale-[0.96]", CELL_CLASS[v])}>
                  {CELL_WORD[v]}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {([
          ["Sections I can teach", maxSections, setMaxSections],
          ["Max distinct courses", maxPreps, setMaxPreps],
        ] as const).map(([label, value, set]) => (
          <label key={label} className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            {label}
            <span className="flex items-center gap-1">
              <button aria-label={`fewer ${label}`} onClick={() => { set(Math.max(0, value - 1)); setLoadTouched(true); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted ring-1 ring-border active:scale-95"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-5 text-center text-sm font-extrabold text-foreground">{value}</span>
              <button aria-label={`more ${label}`} onClick={() => { set(Math.min(8, value + 1)); setLoadTouched(true); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted ring-1 ring-border active:scale-95"><Plus className="h-3.5 w-3.5" /></button>
            </span>
          </label>
        ))}
        <span className="text-[11px] text-muted-foreground">
          {ops.length ? `${ops.length} constraint${ops.length === 1 ? "" : "s"} picked` : "No cells picked — the note alone works too"}
        </span>
      </div>

      <textarea
        className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        placeholder='Optional note — e.g. "Conference in week 6, flexible otherwise."'
        value={note} onChange={(e) => setNote(e.target.value)}
      />
      <button disabled={busy || (ops.length === 0 && !note.trim())}
        onClick={() => onSend(ops, note.trim())}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50">
        <Send className="h-3.5 w-3.5" /> Send
      </button>
    </div>
  );
}

/* ---------------- coordinator: term closures (holidays) ---------------- */

function ClosuresCard({ onToast }: {
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}) {
  const { scenario, refetch } = useScenario();
  const [draft, setDraft] = useState<TermClosure[] | null>(null);
  const [day, setDay] = useState(4);
  const [period, setPeriod] = useState<string>("all");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const list = draft ?? scenario?.closures ?? [];

  async function save(next: TermClosure[]) {
    setSaving(true);
    try {
      const res = await authFetch("/api/term/closures", {
        method: "POST", body: JSON.stringify({ closures: next }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setDraft(null);
      await refetch();
      onToast(next.length ? "Closures saved — Publish to re-solve with them" : "Closures cleared", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-bold tracking-wide uppercase">Term closures · holidays</h3>
        <InfoTip text="Campus closures (holidays, reading days, convocations). The timetable is a weekly pattern, so a closure is a weekday — optionally one period. Nothing is scheduled into a closed slot, by any engine. Takes effect on the next Publish." />
      </div>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((c, i) => (
            <span key={i} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-slate-700 py-1 pr-1.5 pl-2.5 text-[11px] font-semibold text-white">
              {DAY_NAMES[c.day].slice(0, 3)}{c.period != null ? ` ${PERIOD_NAMES[c.period]}` : " · all day"} — {c.label}
              <button aria-label="remove closure" disabled={saving}
                onClick={() => { const n = list.filter((_, j) => j !== i); setDraft(n); save(n); }}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/20"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={day} onChange={(e) => setDay(Number(e.target.value))}
          className="min-h-10 rounded-xl border border-border bg-background px-2 text-xs font-semibold">
          {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}
          className="min-h-10 rounded-xl border border-border bg-background px-2 text-xs font-semibold">
          <option value="all">All day</option>
          {PERIOD_NAMES.map((p, i) => <option key={p} value={i}>{p}</option>)}
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Labor Day)"
          className="min-h-10 min-w-32 flex-1 rounded-xl border border-border bg-background px-2.5 text-xs" />
        <button disabled={saving}
          onClick={() => {
            const c: TermClosure = { day, period: period === "all" ? null : Number(period), label: label.trim() || "Closure" };
            if (!list.some((x) => x.day === c.day && x.period === c.period)) { const n = [...list, c]; setDraft(n); save(n); }
            setLabel("");
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add closure
        </button>
      </div>
    </div>
  );
}

/* ---------------- student: suggest my schedule ---------------- */

function StudentPlanPanel({ user, onToast }: {
  user: AuthUser;
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}) {
  const { scenario } = useScenario();
  const [cohortId, setCohortId] = useState(user.cohort_id ?? "");
  const [programId, setProgramId] = useState("");
  const [recordMode, setRecordMode] = useState<"lookup" | "record">("lookup");
  const [recordText, setRecordText] = useState("Completed: CS 101, CS 201, MATH 201");
  const [message, setMessage] = useState("I work Tuesdays and Thursdays. I need CS 201 this term, and I'd like 4 courses.");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<StudentPlanResponse | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cohortId && scenario?.cohorts?.length) setCohortId(scenario.cohorts[0].id);
  }, [scenario, cohortId]);

  async function suggest() {
    if ((!cohortId && !programId) || !message.trim()) return;
    setBusy(true);
    try {
      const res = await authFetch("/api/student/plan", {
        method: "POST",
        body: JSON.stringify({
          cohort_id: cohortId || undefined,
          program_id: programId || undefined,
          study_record: recordMode === "record" ? recordText : undefined,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Suggestion failed");
      setPlan(data as StudentPlanResponse);
      onToast(
        data.target_met ? "Suggested plan meets your target — verified conflict-free"
          : "Suggested the best fitting plan — see the notes",
        data.target_met ? "success" : "warning");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Suggestion failed", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="elev space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
          <GraduationCap className="h-4 w-4 text-primary" /> Suggest my schedule
        </h3>
        <InfoTip text="Advising from your own record: pick your desired degree, then either let the system look up your progress from your cohort or paste your study record (courses completed). Mandatory vs optional comes from the degree map your institution fed in. Muse Spark parses your record and your life — work days, times you can't attend — then an exact selector recommends mandatory-ready courses first and optional picks to fill, re-verified before shown: no overlaps, nothing already completed, nothing still locked. If a must-take course can't fit, it tells you instead of quietly delaying your degree." />
        {plan && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${plan.target_met ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {plan.courses.length}/{plan.target_courses} courses · {plan.target_met ? "target met" : "target not met"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="plan-cohort">Cohort</label>
        <select id="plan-cohort" value={cohortId} onChange={(e) => setCohortId(e.target.value)}
          className="min-h-10 rounded-xl border border-border bg-background px-2 text-xs font-semibold">
          {(scenario?.cohorts ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="plan-degree">Degree I want</label>
        <select id="plan-degree" value={programId} onChange={(e) => setProgramId(e.target.value)}
          className="min-h-10 rounded-xl border border-border bg-background px-2 text-xs font-semibold">
          <option value="">My cohort&apos;s degree</option>
          {(scenario?.programs ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="plan-progress">My progress</label>
        <select id="plan-progress" value={recordMode} onChange={(e) => setRecordMode(e.target.value as "lookup" | "record")}
          className="min-h-10 rounded-xl border border-border bg-background px-2 text-xs font-semibold">
          <option value="lookup">Look up from my cohort</option>
          <option value="record">Use my study record</option>
        </select>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${plan?.parser_mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-muted text-muted-foreground"}`}>
          {plan ? plan.parser_mode : "muse spark"}
        </span>
        {plan?.model && <span className="font-mono text-[10px] text-muted-foreground">{plan.model}</span>}
      </div>

      {recordMode === "record" && (
        <textarea
          className="min-h-14 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
          value={recordText} onChange={(e) => setRecordText(e.target.value)}
          placeholder="Paste your study record — course codes you have completed, e.g. Completed: CS 101, CS 201, MATH 201"
          aria-label="My study record (completed courses)"
        />
      )}

      {plan?.progress && (
        <div className="animate-rise elev space-y-1.5 rounded-xl border border-border bg-background p-3 text-xs">
          <p className="font-bold">
            {plan.progress.program_name}: {plan.progress.required_completed} of {plan.progress.required_total} mandatory courses completed ({plan.progress.pct_complete}%)
            <span className="ml-2 font-medium text-muted-foreground">from {plan.progress.source}</span>
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="brand-gradient h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${plan.progress.pct_complete}%` }} />
          </div>
          <p className="text-muted-foreground">
            Ready now (mandatory): {plan.progress.mandatory_ready.join(", ") || "none"}
            {plan.progress.mandatory_co_ready.length > 0 && <> · Co-take with gating course: {plan.progress.mandatory_co_ready.join(", ")}</>}
            {plan.progress.mandatory_locked.length > 0 && <> · Still locked: {plan.progress.mandatory_locked.join(", ")}</>}
            {" "}· Optional picks remaining: {plan.progress.optional_remaining}
          </p>
        </div>
      )}

      <textarea
        className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder='e.g. "I work Tue/Thu, I need CS 201, no 8:00 classes, 4 courses please."'
      />
      <button disabled={busy || (!cohortId && !programId) || !message.trim()} onClick={suggest}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Suggest a verified schedule
      </button>

      {plan && plan.notes.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {plan.notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}

      {plan && plan.courses.length > 0 && (
        <div className="animate-rise grid gap-2 sm:grid-cols-2">
          {plan.courses.map((c) => (
            <div key={c.section_id} className={`rounded-xl border border-border border-l-4 bg-background p-3 ${c.required ? "border-l-indigo-500" : "border-l-slate-300"}`}>
              <p className="flex items-center gap-2 text-sm font-extrabold">
                {c.course_code}
                {c.required ? (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">mandatory</span>
                ) : (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">optional</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{c.title}</p>
              <p className="mt-1 text-xs font-semibold">
                {c.days.map((d) => DAY_NAMES[d].slice(0, 3)).join("/")} · {c.start_time}–{c.end_time} · {c.room_name}
              </p>
              <p className="text-[11px] text-muted-foreground">{c.instructor_name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.reason}</p>
            </div>
          ))}
        </div>
      )}

      {plan?.agent_trace && plan.agent_trace.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground">How this plan was proven</summary>
          <ol className="mt-2 space-y-1.5">
            {plan.agent_trace.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.status === "blocked" ? "bg-red-500" : "bg-emerald-500"}`} />
                <span><strong>{s.actor}:</strong> <span className="text-muted-foreground">{s.detail}</span></span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function MyScheduleView({ user, onToast }: {
  user: AuthUser;
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}) {
  const [mine, setMine] = useState<MineResponse | null>(null);
  const [unpublished, setUnpublished] = useState(false);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"matrix" | "timetable">(
    user.role === "coordinator" ? "matrix" : "timetable"
  );
  const { scenario } = useScenario();
  const liveCampus = useMemo(
    () => (scenario && mine ? buildLiveCampus(scenario, mine.placements) : null),
    [scenario, mine]
  );

  const load = useCallback(async () => {
    const res = await authFetch("/api/schedule/mine");
    if (res.status === 404) {
      setUnpublished(true);
      if (user.role === "coordinator") {
        // No published term yet: show the campus matrix from a draft solve so
        // the Schedule tab is useful (and design-complete) before Publish.
        const solved = await (await fetch("/api/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine: "cpsat" }),
        })).json();
        if (solved.timetable?.placements) {
          setMine({
            role: "coordinator",
            scope: "Draft solve — not published yet",
            status: solved.status,
            objective: solved.objective,
            placements: solved.timetable.placements,
          });
        } else {
          setMine(null);
        }
      } else {
        setMine(null);
      }
    } else if (res.ok) { setMine(await res.json()); setUnpublished(false); }
    const listPath = user.role === "coordinator"
      ? "/api/change-requests" : "/api/me/change-requests";
    const list = await authFetch(listPath);
    if (list.ok) setRequests((await list.json()).requests ?? []);
  }, [user.role]);

  // Mount fetch: state writes happen after the awaits.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function publish() {
    setBusy(true);
    try {
      const res = await authFetch("/api/schedule/publish", {
        method: "POST", body: JSON.stringify({ engine: "cpsat" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Publish failed");
      onToast(`Published schedule #${data.id}: ${data.status}, penalty ${data.objective}`, "success");
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Publish failed", "error");
    } finally { setBusy(false); }
  }

  async function sendIntake(operations: IntakeOperation[], note: string) {
    if (operations.length === 0 && !note) return;
    setBusy(true);
    try {
      const res = await authFetch("/api/me/change-requests", {
        method: "POST",
        body: JSON.stringify({
          message: note,
          operations: operations.length ? operations : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Request failed");
      onToast(
        operations.length ? "Intake sent — coordinator approves, solver verifies" : "Change request sent to the coordinator",
        "success");
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Request failed", "error");
    } finally { setBusy(false); }
  }

  async function decide(id: number, action: "apply" | "reject") {
    setBusy(true);
    try {
      const res = await authFetch(`/api/change-requests/${id}/decide`, {
        method: "POST", body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Decision failed");
      onToast(`Request #${id}: ${data.status}`, data.status === "applied" ? "success" : "warning");
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Decision failed", "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight">
              <CalendarDays className="w-4 h-4 text-primary" />
              {user.role === "student" ? "My Cohort Timetable"
                : user.role === "instructor" ? "My Teaching Schedule"
                : "Published Timetable"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {mine ? `${mine.scope} · ${mine.status} · penalty ${mine.objective}` : "Nothing published yet"}
            </p>
          </div>
          <InfoTip text="The coordinator builds the term in Express, then publishes it here. You only see your own sections (instructor) or your cohort's courses (student)." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-muted/60 p-1">
            {(
              [
                ["matrix", "Campus Matrix", LayoutGrid],
                ["timetable", "Timetable", CalendarDays],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-all",
                  view === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          {user.role === "coordinator" && (
            <button disabled={busy} onClick={publish}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> Publish
            </button>
          )}
        </div>
      </div>

      {unpublished && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No schedule published yet.
          {user.role === "coordinator" ? " Build it in Express, then publish here." : " Ask your coordinator to publish it."}
        </div>
      )}

      {mine && mine.placements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm sm:p-3">
          {view === "matrix" ? (
            liveCampus ? (
              <CampusMatrix onToast={onToast} live={liveCampus} />
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Reading the live campus model…
              </div>
            )
          ) : (
            <TimetableGrid placements={mine.placements} />
          )}
        </div>
      )}
      {mine && mine.placements.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
          Nothing assigned to you in the published schedule yet.
        </div>
      )}

      {user.role === "coordinator" && <ClosuresCard onToast={onToast} />}

      {(user.role === "instructor") && (
        <IntakePanel user={user} load={mine?.load} busy={busy} onSend={sendIntake} />
      )}

      {user.role === "student" && <StudentPlanPanel user={user} onToast={onToast} />}

      {requests.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wide">
            {user.role === "coordinator" ? "Intake & change requests" : "My requests"}
          </h3>
          {requests.map((r) => (
            <div key={r.id} className="border border-border rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <div className="text-xs space-y-0.5 min-w-0">
                <p className="font-semibold">
                  #{r.id} · {r.requester || r.instructor_id || "instructor"}
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    r.status === "applied" ? "bg-emerald-100 text-emerald-800"
                    : r.status === "rejected" ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"}`}>{r.status}</span>
                  {r.kind === "structured" && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">picked</span>
                  )}
                  {r.load && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-bold">
                      load {r.load.current}/{r.load.max_sections ?? "?"}
                    </span>
                  )}
                </p>
                {r.operations?.length ? (
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {r.operations.map((o, i) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{o.explanation}</span>
                    ))}
                  </span>
                ) : (
                  <p>{r.message}</p>
                )}
                {r.operations?.length && r.message && !r.operations.some((o) => r.message.includes(o.explanation)) ? (
                  <p className="text-muted-foreground">{r.message.split("\n")[0]}</p>
                ) : null}
                {r.result_summary && (
                  <p className="text-muted-foreground">{r.result_summary}</p>
                )}
              </div>
              {user.role === "coordinator" && r.status === "pending" && (
                <div className="flex gap-1 shrink-0">
                  <button disabled={busy} onClick={() => decide(r.id, "apply")}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50">
                    <Check className="w-3 h-3" /> Apply (verified)
                  </button>
                  <button disabled={busy} onClick={() => decide(r.id, "reject")}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.97] disabled:opacity-50">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
