"use client";

// Term setup: the deadline window before the term begins.
//
// Faculty enter hard constraints + soft preferences; the coordinator watches
// submissions, accepts the set, and reviews/edits the institution model the
// system built from it (campus, buildings, rooms/halls, faculty load rules,
// weeks, holidays, campus-wide constraints, degree maps).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  DoorOpen,
  GraduationCap,
  Loader2,
  Map,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { authFetch, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DAY_NAMES, PERIOD_NAMES } from "@/types";
import type { UniversitySection } from "./university-tabs";

type Toast = (message: string, type?: "info" | "success" | "warning" | "error") => void;

interface Slot {
  day: number;
  period?: number | null;
}

interface Preference {
  kind: "prefer" | "avoid";
  day?: number | null;
  period?: number | null;
  course_id?: string | null;
  weight: number;
}

interface Submission {
  id: number;
  instructor_id: string;
  instructor_name: string;
  status: string;
  note: string;
  hard_unavailable: Slot[];
  preferences: Preference[];
  hard_count: number;
  preference_count: number;
  submitted_at: string | null;
  updated_at: string | null;
}

interface TermWindow {
  id: number;
  term: string;
  status: "draft" | "open" | "closed" | "accepted" | string;
  opens_at: string;
  deadline: string;
  weeks: number;
  accepted_at: string | null;
  deadline_passed: boolean;
  seconds_left: number;
  days_left: number;
  open: boolean;
  total_faculty: number;
  submitted_count: number;
  pending: string[];
  submissions: Submission[];
  role: string;
  instructor_id: string | null;
  options: Record<string, unknown>;
}

interface BuildingRow {
  id: string;
  name: string;
  campus?: string;
  rooms: number;
  seats: number;
  capacity?: number;
  peak_seats?: number;
  utilization?: number;
  scheduled_sections?: number;
}

interface RoomRow {
  id: string;
  name: string;
  building_id: string;
  building_name: string;
  capacity: number;
  room_type: string;
  equipment: string[];
  hall: boolean;
}

interface FacultyRow {
  id: string;
  name: string;
  max_sections: number;
  max_preps: number;
  qualified_courses: string[];
  assigned_sections: number;
  preps: number;
  load_pct: number;
  hard_unavailable: Slot[];
  preferences: Preference[];
}

interface CourseRow {
  id: string;
  code: string;
  title: string;
  pattern: string;
  room_type: string;
  seats: number;
  equipment: string[];
  duration: number;
}

interface ProgramRow {
  id: string;
  name: string;
  kind?: "major" | "minor";
  degree?: string;
  department?: string;
  roadmap: Record<string, { course_id: string; required: boolean; seat_estimate?: number | null }[]>;
}

interface CohortRow {
  id: string;
  name: string;
  program_id: string;
  program_name: string;
  current_term: number;
  size: number;
  admission_year: number;
  graduation_year: number;
  term_courses: string[];
}

interface Overview {
  term: {
    name: string;
    weeks: number;
    status: string;
    opens_at: string;
    deadline: string;
    start_date?: string;
    end_date?: string;
    exam_week_start?: string;
  };
  options?: Record<string, unknown>;
  programs?: ProgramRow[];
  cohorts?: CohortRow[];
  campuses: { id: string; name: string; buildings: BuildingRow[] }[];
  buildings: BuildingRow[];
  building_utilization?: {
    id: string;
    name: string;
    campus: string;
    capacity: number;
    peak_seats: number;
    utilization: number;
    scheduled_sections: number;
  }[];
  rooms: RoomRow[];
  halls: RoomRow[];
  faculty: FacultyRow[];
  load_rules: {
    walk_limit_min: number;
    total_sections: number;
    faculty_capacity_sections: number;
    capacity_gap: number;
    max_sections_per_instructor: number;
    max_preps_per_instructor: number;
    patterns: Record<string, { days: number[]; hours: number }>;
    periods: string[];
    days: string[];
  };
  weeks: { count: number; teaching_days: string[]; periods_per_day: number; pattern: string };
  holidays: { day: number; period?: number | null; label: string }[];
  constraints: {
    walk_limit_min: number;
    closures: number;
    room_blackouts: number;
    active_enrollment: number;
    instructor_pins: number;
    room_pins: number;
  };
  degree_maps: { programs: ProgramRow[]; cohorts: CohortRow[] };
  courses: CourseRow[];
  counts: Record<string, number>;
}

type EditState =
  | { kind: "building"; id: string; name: string }
  | { kind: "room"; id: string; name: string; capacity: number; room_type: string; building_id: string; equipment: string }
  | { kind: "instructor"; id: string; name: string; max_sections: number; max_preps: number; qualified: string }
  | { kind: "cohort"; id: string; name: string; size: number; current_term: number; program_id: string }
  | { kind: "program"; id: string; name: string; roadmap: string }
  | {
      kind: "course";
      id: string;
      code: string;
      title: string;
      pattern: string;
      room_type: string;
      seats: number;
      equipment: string;
    }
  | { kind: "closure"; id: string; label: string; day: number; period: string }
  | { kind: "constraint"; id: string; value: number };

const CARD = "rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs sm:p-4";
const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600";

const STATUS_TONE: Record<string, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-slate-200 bg-slate-100 text-slate-600",
  closed: "border-amber-200 bg-amber-50 text-amber-700",
  accepted: "border-blue-200 bg-blue-50 text-blue-700",
};

function isoForInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = Math.max(0, new Date(deadline).getTime() - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <span className="font-mono text-sm font-bold tabular-nums">
      {days}d {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m{" "}
      {String(seconds).padStart(2, "0")}s
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-black tracking-tight text-slate-900">{value}</div>
      {hint && <div className="text-[10px] font-medium text-slate-500">{hint}</div>}
    </div>
  );
}

function Section({
  title,
  hint,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(CARD, className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>
            {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  tone = "slate",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "slate" | "rose";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 transition-colors",
        tone === "rose"
          ? "text-rose-500 hover:bg-rose-50 hover:text-rose-700"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

export function TermSetupView({
  user,
  onToast,
  section,
  onNavigate,
}: {
  user: AuthUser;
  onToast: Toast;
  section: UniversitySection;
  onNavigate: (section: UniversitySection) => void;
}) {
  const [window, setWindow] = useState<TermWindow | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  const [term, setTerm] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [deadline, setDeadline] = useState("");
  const [weeks, setWeeks] = useState(16);

  const [cells, setCells] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [coursePrefs, setCoursePrefs] = useState<Preference[]>([]);
  const [holiday, setHoliday] = useState({ day: 0, period: "", label: "Holiday" });
  const [engine, setEngine] = useState("cpsat");
  const [objective, setObjective] = useState("preference");
  const [autoPublish, setAutoPublish] = useState(false);
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  const isCoordinator = user.role === "coordinator";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, oRes] = await Promise.all([
        authFetch("/api/term/window"),
        authFetch("/api/institution/overview"),
      ]);
      const w: TermWindow = await wRes.json();
      const o: Overview = await oRes.json();
      if (!wRes.ok) throw new Error((w as unknown as { detail?: string }).detail || "Could not load the intake window.");
      if (!oRes.ok) throw new Error((o as unknown as { detail?: string }).detail || "Could not load the institution model.");
      setWindow(w);
      setOverview(o);
      setTerm(w.term);
      setOpensAt(isoForInput(w.opens_at));
      setDeadline(isoForInput(w.deadline));
      setWeeks(w.weeks);
      const options = (w.options ?? {}) as Record<string, unknown>;
      setEngine(typeof options.engine === "string" ? options.engine : "cpsat");
      setObjective(typeof options.objective === "string" ? options.objective : "preference");
      setAutoPublish(Boolean(options.auto_publish));
      setTermStart(typeof options.start_date === "string" ? isoForInput(options.start_date) : "");
      setTermEnd(typeof options.end_date === "string" ? isoForInput(options.end_date) : "");

      if (user.role === "instructor") {
        const mine = w.submissions.find((s) => s.instructor_id === user.instructor_id);
        const next: Record<string, number> = {};
        mine?.hard_unavailable.forEach((slot) => {
          if (slot.period !== undefined && slot.period !== null) next[`${slot.day}-${slot.period}`] = 3;
        });
        mine?.preferences.forEach((pref) => {
          if (pref.course_id) return;
          if (pref.day === undefined || pref.day === null) return;
          if (pref.period === undefined || pref.period === null) {
            for (let p = 0; p < 4; p++) next[`${pref.day}-${p}`] = pref.kind === "prefer" ? 1 : 2;
          } else {
            next[`${pref.day}-${pref.period}`] = pref.kind === "prefer" ? 1 : 2;
          }
        });
        setCells(next);
        setNote(mine?.note ?? "");
        setCoursePrefs(mine?.preferences.filter((pref) => Boolean(pref.course_id)) ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load term setup.");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.instructor_id]);

  useEffect(() => {
    // Mount fetch: every state write after the first await is async; the
    // synchronous loading flag is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const mine = useMemo(
    () => window?.submissions.find((s) => s.instructor_id === user.instructor_id) ?? null,
    [window, user.instructor_id]
  );

  const act = async (name: string, path: string, body?: unknown) => {
    setBusy(name);
    try {
      const res = await authFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Action failed.");
      await load();
      onToast(`${name} complete`, "success");
      return data;
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Action failed.", "error");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveWindow = async () => {
    const data = await act("Save window", "/api/term/window", {
      term,
      opens_at: opensAt ? new Date(opensAt).toISOString() : undefined,
      deadline: deadline ? new Date(deadline).toISOString() : undefined,
      weeks,
    });
    if (data) onToast("Intake window saved", "success");
  };

  const submitIntake = async () => {
    const hard: Slot[] = [];
    const prefs: Preference[] = [...coursePrefs];
    Object.entries(cells).forEach(([key, state]) => {
      if (state === 0) return;
      const [day, period] = key.split("-").map(Number);
      if (state === 3) hard.push({ day, period });
      else prefs.push({ kind: state === 1 ? "prefer" : "avoid", day, period, weight: 8 });
    });
    const data = await act("Submit constraints", "/api/term/window/submit", {
      hard_unavailable: hard,
      preferences: prefs,
      note,
    });
    if (data) onToast("Constraints submitted — the coordinator can review them", "success");
  };

  const removeEntity = async (kind: string, id: string, label: string) => {
    if (!globalThis.confirm(`Remove ${label}? This changes the institution model used by the solver.`)) return;
    setBusy(`remove-${kind}-${id}`);
    try {
      const res = await authFetch(`/api/institution/entity?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Remove failed.");
      setOverview(data.overview);
      onToast(`${label} removed`, "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Remove failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    let patch: Record<string, unknown> = {};
    if (edit.kind === "building") patch = { name: edit.name };
    if (edit.kind === "room") {
      patch = {
        name: edit.name,
        capacity: edit.capacity,
        room_type: edit.room_type,
        building_id: edit.building_id,
        equipment: edit.equipment.split(",").map((item) => item.trim()).filter(Boolean),
      };
    }
    if (edit.kind === "instructor") {
      patch = {
        name: edit.name,
        max_sections: edit.max_sections,
        max_preps: edit.max_preps,
        qualified_courses: edit.qualified.split(",").map((item) => item.trim()).filter(Boolean),
      };
    }
    if (edit.kind === "cohort") {
      patch = { name: edit.name, size: edit.size, current_term: edit.current_term, program_id: edit.program_id };
    }
    if (edit.kind === "program") {
      try {
        patch = { name: edit.name, roadmap: JSON.parse(edit.roadmap) };
      } catch {
        onToast("Degree map must be valid JSON", "error");
        return;
      }
    }
    if (edit.kind === "course") {
      patch = {
        code: edit.code,
        title: edit.title,
        pattern: edit.pattern,
        room_type: edit.room_type,
        seats: edit.seats,
        equipment: edit.equipment.split(",").map((item) => item.trim()).filter(Boolean),
      };
    }
    if (edit.kind === "closure") {
      patch = { label: edit.label, day: edit.day, period: edit.period === "" ? null : Number(edit.period) };
    }
    if (edit.kind === "constraint") patch = { value: edit.value };

    setBusy("save-edit");
    try {
      const res = await authFetch("/api/institution/entity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: edit.kind, id: edit.id, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Save failed.");
      setOverview(data.overview);
      setEdit(null);
      onToast("Institution model updated", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const addHoliday = async () => {
    if (!overview) return;
    const closures = [
      ...overview.holidays.map((entry) => ({
        day: entry.day,
        period: entry.period ?? null,
        label: entry.label,
      })),
      { day: holiday.day, period: holiday.period === "" ? null : Number(holiday.period), label: holiday.label || "Holiday" },
    ];
    setBusy("add-holiday");
    try {
      const res = await authFetch("/api/term/closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not add holiday.");
      await load();
      onToast("Holiday added to campus-wide constraints", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Could not add holiday.", "error");
    } finally {
      setBusy(null);
    }
  };

  const saveOptions = async () => {
    setBusy("save-options");
    try {
      const res = await authFetch("/api/term/window/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          options: {
            engine,
            objective,
            auto_publish: autoPublish,
            start_date: termStart ? new Date(termStart).toISOString() : null,
            end_date: termEnd ? new Date(termEnd).toISOString() : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not save options.");
      await load();
      onToast("Schedule options saved to Postgres", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Could not save options.", "error");
    } finally {
      setBusy(null);
    }
  };

  const uploadUpdate = async () => {
    if (!uploadText.trim()) {
      onToast("Paste the updated institution data first.", "warning");
      return;
    }
    setUploadBusy(true);
    try {
      const res = await authFetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: uploadText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Upload failed.");
      await load();
      setUploadText("");
      onToast("Institution data updated and saved", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setUploadBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        Reading the intake window and institution model…
      </div>
    );
  }

  if (error || !window || !overview) {
    return (
      <Section title="Term setup unavailable" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}>
        <p className="text-sm text-slate-600">{error ?? "The term window could not be loaded."}</p>
        <button
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </Section>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Pre-term setup
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                STATUS_TONE[window.status] ?? STATUS_TONE.draft
              )}
            >
              {window.status}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {window.weeks} weeks
            </span>
          </div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">{window.term}</h2>
          <p className="text-xs text-slate-500">
            Faculty enter constraints before the deadline. The coordinator accepts the set, then the
            solver builds the term from the reviewed institution model.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <Clock className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {window.deadline_passed ? "Deadline passed" : "Deadline in"}
            </div>
            {window.deadline_passed ? (
              <span className="text-sm font-bold text-amber-700">
                {new Date(window.deadline).toLocaleString()}
              </span>
            ) : (
              <Countdown deadline={window.deadline} />
            )}
          </div>
        </div>
      </div>

      {section === "people" && (
        <>
      {/* Intake window + progress */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Section
          title="Faculty intake window"
          hint="Every faculty member submits hard unavailability and soft preferences before this deadline."
          icon={<CalendarDays className="h-4 w-4 text-blue-600" />}
          className="lg:col-span-2"
        >
          {isCoordinator ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Term
                <input value={term} onChange={(e) => setTerm(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Opens
                <input
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Deadline
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Weeks
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
              <div className="col-span-full flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => void saveWindow()}
                  disabled={busy !== null}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {busy === "Save window" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  Save window
                </button>
                <button
                  onClick={() => void act("Open intake", "/api/term/window/open")}
                  disabled={busy !== null || window.status === "open"}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Open intake
                </button>
                <button
                  onClick={() => void act("Close intake", "/api/term/window/close")}
                  disabled={busy !== null || window.status !== "open"}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  Close intake
                </button>
                <button
                  onClick={() => void act("Accept all input", "/api/term/window/accept")}
                  disabled={busy !== null || window.submitted_count === 0 || window.status === "accepted"}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === "Accept all input" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Accept all input &amp; build model
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-600">
                <strong className="text-slate-900">{window.status === "open" ? "Open" : window.status}</strong>
                {" · "}deadline {new Date(window.deadline).toLocaleString()}
              </div>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                  mine ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                )}
              >
                {mine ? "Submitted" : "Awaiting your input"}
              </span>
            </div>
          )}
        </Section>

        <Section
          title="Submission progress"
          hint="The coordinator can accept only after at least one faculty submission."
          icon={<Users className="h-4 w-4 text-blue-600" />}
        >
          <div className="flex items-end justify-between">
            <div className="text-2xl font-black text-slate-900">
              {window.submitted_count}
              <span className="text-sm font-bold text-slate-400"> / {window.total_faculty}</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">faculty submitted</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500 transition-all"
              style={{ width: `${Math.round((100 * window.submitted_count) / Math.max(1, window.total_faculty))}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {window.pending.length === 0
              ? "Everyone has submitted."
              : `Pending: ${window.pending.join(", ")}`}
          </div>
        </Section>
      </div>
        </>
      )}

      {/* Instructor submission grid */}
      {section === "people" && !isCoordinator && (
        <Section
          title="Your constraints & preferences"
          hint="Click a cell to cycle: available → prefer → avoid → off. Off is a hard blackout; prefer/avoid are soft."
          icon={<Users className="h-4 w-4 text-purple-600" />}
          action={
            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700">
              {mine ? `${mine.hard_count} hard · ${mine.preference_count} soft` : "not submitted"}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-center text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Day</th>
                  {PERIOD_NAMES.map((period) => (
                    <th key={period} className="p-1 text-[10px] font-bold text-slate-600">
                      {period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_NAMES.map((day, dayIndex) => (
                  <tr key={day}>
                    <td className="p-1 text-left text-[11px] font-bold text-slate-700">{day}</td>
                    {PERIOD_NAMES.map((_, period) => {
                      const state = cells[`${dayIndex}-${period}`] ?? 0;
                      const label = ["", "Prefer", "Avoid", "Off"][state];
                      return (
                        <td key={period} className="p-1">
                          <button
                            type="button"
                            onClick={() =>
                              setCells((prev) => ({ ...prev, [`${dayIndex}-${period}`]: (state + 1) % 4 }))
                            }
                            className={cn(
                              "h-9 w-full rounded-lg border text-[10px] font-bold transition-all",
                              state === 0 && "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100",
                              state === 1 && "border-emerald-300 bg-emerald-100 text-emerald-800",
                              state === 2 && "border-amber-300 bg-amber-100 text-amber-800",
                              state === 3 && "border-slate-700 bg-slate-700 text-white"
                            )}
                          >
                            {label || "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Note to the coordinator
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything the grid cannot express (childcare, committee duty, preferred courses)…"
              className={cn(FIELD, "mt-1 resize-y")}
            />
          </label>
          <button
            onClick={() => void submitIntake()}
            disabled={busy !== null || !window.open}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "Submit constraints" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {mine ? "Update submission" : "Submit constraints"}
          </button>
          {!window.open && (
            <span className="ml-2 text-[11px] font-semibold text-amber-700">
              The window is {window.deadline_passed ? "past its deadline" : window.status}.
            </span>
          )}
        </Section>
      )}

      {/* Coordinator submissions table */}
      {section === "people" && isCoordinator && (
        <Section
          title="Faculty submissions"
          hint="Who has submitted, what they asked for, and whether it was accepted into the model."
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          action={
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Faculty</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Hard</th>
                  <th className="p-2.5">Soft</th>
                  <th className="p-2.5">Note</th>
                  <th className="p-2.5">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {window.submissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-900">{submission.instructor_name}</td>
                    <td className="p-2.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          submission.status === "accepted"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {submission.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono">{submission.hard_count}</td>
                    <td className="p-2.5 font-mono">{submission.preference_count}</td>
                    <td className="max-w-[280px] truncate p-2.5 text-slate-600" title={submission.note}>
                      {submission.note || "—"}
                    </td>
                    <td className="p-2.5 font-mono text-[10px] text-slate-500">
                      {submission.updated_at ? new Date(submission.updated_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
                {window.submissions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-[11px] text-slate-500">
                      No submissions yet. Open the window and share the deadline with faculty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Institution model */}
      {section === "overview" && (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Buildings" value={String(overview.counts.buildings)} />
        <Stat label="Rooms" value={String(overview.counts.rooms)} />
        <Stat label="Halls" value={String(overview.counts.halls)} />
        <Stat label="Faculty" value={String(overview.counts.faculty)} />
        <Stat label="Sections" value={String(overview.counts.sections)} />
        <Stat label="Cohorts" value={String(overview.counts.cohorts)} />
      </div>
      )}

      {section === "overview" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="Load calculation requirements" icon={<ShieldCheck className="h-4 w-4 text-blue-600" />}>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Sections to place", overview.load_rules.total_sections],
                ["Faculty capacity", `${overview.load_rules.faculty_capacity_sections} sections`],
                ["Capacity gap", `${overview.load_rules.capacity_gap}`],
                ["Max sections / professor", overview.load_rules.max_sections_per_instructor],
                ["Max preps / professor", overview.load_rules.max_preps_per_instructor],
                ["Walk limit", `${overview.load_rules.walk_limit_min} min`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="font-mono text-sm font-bold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">
              Meeting patterns:{" "}
              {Object.entries(overview.load_rules.patterns)
                .map(([name, rule]) => `${name} ${rule.hours}h (${rule.days.map((d) => DAY_NAMES[d].slice(0, 3)).join("/")})`)
                .join(" · ")}
            </p>
          </Section>
          <Section title="Term shape & campus constraints" icon={<CalendarDays className="h-4 w-4 text-emerald-600" />}>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Weeks", overview.weeks.count],
                ["Teaching days", overview.weeks.teaching_days.length],
                ["Periods / day", overview.weeks.periods_per_day],
                ["Holidays", overview.constraints.closures],
                ["Room blackouts", overview.constraints.room_blackouts],
                ["Active enrollment overrides", overview.constraints.active_enrollment],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="font-mono text-sm font-bold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">{overview.weeks.pattern}</p>
          </Section>
        </div>
      )}

      {section === "facility" && (
        <Section
          title="Campus & buildings"
          hint={`${overview.campuses[0]?.name ?? "Institution"} — every building the solver can place a section in.`}
          icon={<Building2 className="h-4 w-4 text-blue-600" />}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Building</th>
                  <th className="p-2.5">Rooms</th>
                  <th className="p-2.5">Seats</th>
                  <th className="p-2.5">Utilization</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.buildings.map((building) => (
                  <tr key={building.id} className="hover:bg-slate-50">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-900">{building.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{building.id}</div>
                    </td>
                    <td className="p-2.5 font-mono">{building.rooms}</td>
                    <td className="p-2.5 font-mono">{building.seats.toLocaleString()}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-9 font-mono text-[11px] font-bold">{building.utilization ?? 0}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              (building.utilization ?? 0) > 90
                                ? "bg-rose-500"
                                : (building.utilization ?? 0) > 75
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            )}
                            style={{ width: `${Math.min(100, building.utilization ?? 0)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {building.scheduled_sections ?? 0} sections
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          label={`Edit ${building.name}`}
                          onClick={() => setEdit({ kind: "building", id: building.id, name: building.name })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${building.name}`}
                          tone="rose"
                          onClick={() => void removeEntity("building", building.id, building.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {section === "facility" && (
        <Section
          title="Rooms & halls"
          hint={`${overview.rooms.length} rooms · ${overview.halls.length} large halls (capacity ≥ 100). Edit capacity/equipment or remove a room.`}
          icon={<DoorOpen className="h-4 w-4 text-indigo-600" />}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Room</th>
                  <th className="p-2.5">Building</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5">Capacity</th>
                  <th className="p-2.5">Equipment</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-900">
                        {room.name} {room.hall && <span className="rounded bg-purple-100 px-1 text-[9px] font-bold text-purple-700">HALL</span>}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{room.id}</div>
                    </td>
                    <td className="p-2.5">{room.building_name}</td>
                    <td className="p-2.5 capitalize">{room.room_type}</td>
                    <td className="p-2.5 font-mono">{room.capacity}</td>
                    <td className="p-2.5 text-[10px] text-slate-600">{room.equipment.join(", ") || "—"}</td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          label={`Edit ${room.name}`}
                          onClick={() =>
                            setEdit({
                              kind: "room",
                              id: room.id,
                              name: room.name,
                              capacity: room.capacity,
                              room_type: room.room_type,
                              building_id: room.building_id,
                              equipment: room.equipment.join(", "),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${room.name}`}
                          tone="rose"
                          onClick={() => void removeEntity("room", room.id, room.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {section === "people" && (
        <Section
          title="Faculty & load calculations"
          hint="Contract caps, qualifications and the current placed load. Edits apply to the next solve."
          icon={<Users className="h-4 w-4 text-purple-600" />}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Faculty</th>
                  <th className="p-2.5">Max sections</th>
                  <th className="p-2.5">Max preps</th>
                  <th className="p-2.5">Qualified</th>
                  <th className="p-2.5">Placed load</th>
                  <th className="p-2.5">Preferences</th>
                  <th className="p-2.5">Intake</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.faculty.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-900">{member.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{member.id}</div>
                    </td>
                    <td className="p-2.5 font-mono">{member.max_sections}</td>
                    <td className="p-2.5 font-mono">{member.max_preps}</td>
                    <td className="max-w-[240px] truncate p-2.5 text-[10px] text-slate-600" title={member.qualified_courses.join(", ")}>
                      {member.qualified_courses.join(", ")}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          {member.assigned_sections}/{member.max_sections}
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full", member.load_pct > 100 ? "bg-rose-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(100, member.load_pct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 text-[10px] text-slate-600">
                      <span title={JSON.stringify(member.preferences)}>
                        {member.hard_unavailable.length} hard · {member.preferences.length} soft
                      </span>
                    </td>
                    <td className="p-2.5">
                      {(() => {
                        const submission = window.submissions.find((s) => s.instructor_id === member.id);
                        return submission ? (
                          <span
                            className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700"
                            title={`${submission.hard_count} hard · ${submission.preference_count} soft`}
                          >
                            submitted
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            pending
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          label={`Edit ${member.name}`}
                          onClick={() =>
                            setEdit({
                              kind: "instructor",
                              id: member.id,
                              name: member.name,
                              max_sections: member.max_sections,
                              max_preps: member.max_preps,
                              qualified: member.qualified_courses.join(", "),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${member.name}`}
                          tone="rose"
                          onClick={() => void removeEntity("instructor", member.id, member.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {section === "weeks" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="Term weeks" hint="How many weeks the timetable repeats across." icon={<CalendarDays className="h-4 w-4 text-blue-600" />}>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Number of weeks
              <input
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className={cn(FIELD, "mt-1 max-w-[140px]")}
              />
            </label>
            <button
              onClick={() => void saveWindow()}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              Save weeks
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              The weekly pattern runs {overview.weeks.teaching_days.length} days × {overview.weeks.periods_per_day} periods.
            </p>
          </Section>
          <Section
            title="Holidays & campus closures"
            hint="Closures remove a weekday/period from the timetable everywhere."
            icon={<CalendarDays className="h-4 w-4 text-amber-600" />}
          >
            <div className="space-y-1.5">
              {overview.holidays.map((entry, index) => (
                <div
                  key={`${entry.day}-${entry.period ?? "all"}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                >
                  <div>
                    <strong className="text-slate-900">{entry.label}</strong>{" "}
                    <span className="font-mono text-[10px] text-slate-500">
                      {DAY_NAMES[entry.day]}
                      {entry.period !== undefined && entry.period !== null ? ` ${PERIOD_NAMES[entry.period]}` : " (all day)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`Edit ${entry.label}`}
                      onClick={() =>
                        setEdit({
                          kind: "closure",
                          id: String(index),
                          label: entry.label,
                          day: entry.day,
                          period: entry.period === undefined || entry.period === null ? "" : String(entry.period),
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${entry.label}`}
                      tone="rose"
                      onClick={() => void removeEntity("closure", String(index), entry.label)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              ))}
              {overview.holidays.length === 0 && (
                <p className="text-[11px] text-slate-500">No holidays or closures recorded.</p>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Label
                <input
                  value={holiday.label}
                  onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Day
                <select
                  value={holiday.day}
                  onChange={(e) => setHoliday((h) => ({ ...h, day: Number(e.target.value) }))}
                  className={cn(FIELD, "mt-1")}
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Period
                <select
                  value={holiday.period}
                  onChange={(e) => setHoliday((h) => ({ ...h, period: e.target.value }))}
                  className={cn(FIELD, "mt-1")}
                >
                  <option value="">All day</option>
                  {PERIOD_NAMES.map((period, index) => (
                    <option key={period} value={index}>
                      {period}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => void addHoliday()}
                disabled={busy !== null}
                className="mt-5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </Section>
        </div>
      )}

      {section === "constraints" && (
        <Section
          title="Campus-wide constraints"
          hint="Institution-level rules the solver enforces on every section."
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Walk limit</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-lg font-black text-slate-900">{overview.constraints.walk_limit_min} min</span>
                <IconButton
                  label="Edit walk limit"
                  onClick={() =>
                    setEdit({ kind: "constraint", id: "walk_limit_min", value: overview.constraints.walk_limit_min })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Holidays</div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">{overview.constraints.closures}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room blackouts</div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">{overview.constraints.room_blackouts}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Active enrollment overrides</div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">{overview.constraints.active_enrollment}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Instructor pins</div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">{overview.constraints.instructor_pins}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room pins</div>
              <div className="mt-1 font-mono text-lg font-black text-slate-900">{overview.constraints.room_pins}</div>
            </div>
          </div>
        </Section>
      )}

      {section === "degrees" && (
        <div className="space-y-3">
          <Section
            title="Degree maps"
            hint="Programs and cohorts: what each cohort must take this term. Majors and minors are separate; edit the roadmap JSON or a cohort's term/size."
            icon={<GraduationCap className="h-4 w-4 text-emerald-600" />}
          >
            <div className="space-y-3">
              {(["major", "minor"] as const).map((kind) => (
                <div key={kind} className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {kind === "major" ? "Majors & degrees" : "Minors"}
                  </div>
                  {overview.degree_maps.programs
                    .filter((program) => (program.kind ?? "major") === kind)
                    .map((program) => (
                      <div key={program.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-slate-900">{program.name}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {program.id} · {program.degree ?? (kind === "minor" ? "Minor" : "BSc")}
                              {program.department ? ` · ${program.department}` : ""}
                            </div>
                          </div>
                          <IconButton
                            label={`Edit ${program.name}`}
                            onClick={() =>
                              setEdit({
                                kind: "program",
                                id: program.id,
                                name: program.name,
                                roadmap: JSON.stringify(program.roadmap, null, 2),
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2">
                          {Object.entries(program.roadmap).map(([term, requirements]) => (
                            <div key={term} className="rounded-lg border border-slate-200 bg-white p-2">
                              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                Term {term}
                              </div>
                              <div className="text-slate-700">
                                {requirements
                                  .map((req) => `${req.course_id}${req.required ? "" : " (elective)"}`)
                                  .join(", ") || "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Cohorts"
            hint="Cohort size and current term drive demand and the degree-map requirements."
            icon={<Users className="h-4 w-4 text-blue-600" />}
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="p-2.5">Cohort</th>
                    <th className="p-2.5">Program</th>
                    <th className="p-2.5">Term</th>
                    <th className="p-2.5">Size</th>
                    <th className="p-2.5">Courses this term</th>
                    <th className="p-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.degree_maps.cohorts.map((cohort) => (
                    <tr key={cohort.id} className="hover:bg-slate-50">
                      <td className="p-2.5">
                        <div className="font-bold text-slate-900">{cohort.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">{cohort.id}</div>
                      </td>
                      <td className="p-2.5">{cohort.program_name}</td>
                      <td className="p-2.5 font-mono">{cohort.current_term}</td>
                      <td className="p-2.5 font-mono">{cohort.size}</td>
                      <td className="max-w-[220px] truncate p-2.5 text-[10px] text-slate-600" title={cohort.term_courses.join(", ")}>
                        {cohort.term_courses.join(", ")}
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconButton
                            label={`Edit ${cohort.name}`}
                            onClick={() =>
                              setEdit({
                                kind: "cohort",
                                id: cohort.id,
                                name: cohort.name,
                                size: cohort.size,
                                current_term: cohort.current_term,
                                program_id: cohort.program_id,
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label={`Remove ${cohort.name}`}
                            tone="rose"
                            onClick={() => void removeEntity("cohort", cohort.id, cohort.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {section === "map" && (
        <Section
          title="Campus map"
          hint="Buildings grouped by campus quad. Select a building to inspect or edit its rooms."
          icon={<Map className="h-4 w-4 text-blue-600" />}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(
              overview.buildings.reduce<Record<string, BuildingRow[]>>((acc, building) => {
                const key = building.campus || "Main Campus";
                (acc[key] ??= []).push(building);
                return acc;
              }, {})
            ).map(([campus, buildings]) => (
              <div key={campus} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-900">{campus}</h4>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                    {buildings.length} buildings
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {buildings.map((building) => (
                    <button
                      key={building.id}
                      onClick={() => onNavigate("facility")}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] transition-all hover:border-blue-300 hover:shadow-xs"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-slate-900">{building.name}</span>
                        <span className="block font-mono text-[9px] text-slate-500">{building.id}</span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-[9px] text-slate-500">
                        {building.rooms} rooms
                        <br />
                        {building.seats.toLocaleString()} seats
                        <br />
                        <span
                          className={cn(
                            "font-bold",
                            (building.utilization ?? 0) > 90
                              ? "text-rose-600"
                              : (building.utilization ?? 0) > 75
                                ? "text-amber-600"
                                : "text-emerald-600"
                          )}
                        >
                          {building.utilization ?? 0}% used
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {section === "catalog" && (
        <Section
          title="Course catalog"
          hint={`${overview.courses.length} courses. Patterns, room type, seats and required equipment drive the solver.`}
          icon={<BookOpen className="h-4 w-4 text-indigo-600" />}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Course</th>
                  <th className="p-2.5">Pattern</th>
                  <th className="p-2.5">Room</th>
                  <th className="p-2.5">Seats</th>
                  <th className="p-2.5">Equipment</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.courses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-900">
                        {course.code} · {course.title}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{course.id}</div>
                    </td>
                    <td className="p-2.5 font-mono">{course.pattern}</td>
                    <td className="p-2.5 capitalize">{course.room_type}</td>
                    <td className="p-2.5 font-mono">{course.seats}</td>
                    <td className="p-2.5 text-[10px] text-slate-600">{course.equipment.join(", ") || "—"}</td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          label={`Edit ${course.code}`}
                          onClick={() =>
                            setEdit({
                              kind: "course",
                              id: course.id,
                              code: course.code,
                              title: course.title,
                              pattern: course.pattern,
                              room_type: course.room_type,
                              seats: course.seats,
                              equipment: course.equipment.join(", "),
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${course.code}`}
                          tone="rose"
                          onClick={() => void removeEntity("course", course.id, course.code)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {section === "students" && (
        <Section
          title="Student bodies"
          hint="Every cohort, its program, current term and the courses it must take this term."
          icon={<Users className="h-4 w-4 text-emerald-600" />}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-2.5">Cohort</th>
                  <th className="p-2.5">Program</th>
                  <th className="p-2.5">Term</th>
                  <th className="p-2.5">Size</th>
                  <th className="p-2.5">Courses this term</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.degree_maps.cohorts.map((cohort) => (
                  <tr key={cohort.id} className="hover:bg-slate-50">
                    <td className="p-2.5">
                      <div className="font-bold text-slate-900">{cohort.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{cohort.id}</div>
                    </td>
                    <td className="p-2.5">{cohort.program_name}</td>
                    <td className="p-2.5 font-mono">{cohort.current_term}</td>
                    <td className="p-2.5 font-mono">{cohort.size}</td>
                    <td className="max-w-[260px] truncate p-2.5 text-[10px] text-slate-600" title={cohort.term_courses.join(", ")}>
                      {cohort.term_courses.join(", ") || "—"}
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          label={`Edit ${cohort.name}`}
                          onClick={() =>
                            setEdit({
                              kind: "cohort",
                              id: cohort.id,
                              name: cohort.name,
                              size: cohort.size,
                              current_term: cohort.current_term,
                              program_id: cohort.program_id,
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${cohort.name}`}
                          tone="rose"
                          onClick={() => void removeEntity("cohort", cohort.id, cohort.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {section === "holidays" && (
        <Section
          title="Holidays & campus closures"
          hint="A closure removes a weekday (or one period) from the timetable everywhere."
          icon={<CalendarDays className="h-4 w-4 text-amber-600" />}
        >
          <div className="space-y-1.5">
            {overview.holidays.map((entry, index) => (
              <div
                key={`${entry.day}-${entry.period ?? "all"}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
              >
                <div>
                  <strong className="text-slate-900">{entry.label}</strong>{" "}
                  <span className="font-mono text-[10px] text-slate-500">
                    {DAY_NAMES[entry.day]}
                    {entry.period !== undefined && entry.period !== null ? ` ${PERIOD_NAMES[entry.period]}` : " (all day)"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Edit ${entry.label}`}
                    onClick={() =>
                      setEdit({
                        kind: "closure",
                        id: String(index),
                        label: entry.label,
                        day: entry.day,
                        period: entry.period === undefined || entry.period === null ? "" : String(entry.period),
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${entry.label}`}
                    tone="rose"
                    onClick={() => void removeEntity("closure", String(index), entry.label)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            ))}
            {overview.holidays.length === 0 && (
              <p className="text-[11px] text-slate-500">No holidays or closures recorded.</p>
            )}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Label
              <input
                value={holiday.label}
                onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))}
                className={cn(FIELD, "mt-1")}
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Day
              <select
                value={holiday.day}
                onChange={(e) => setHoliday((h) => ({ ...h, day: Number(e.target.value) }))}
                className={cn(FIELD, "mt-1")}
              >
                {DAY_NAMES.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Period
              <select
                value={holiday.period}
                onChange={(e) => setHoliday((h) => ({ ...h, period: e.target.value }))}
                className={cn(FIELD, "mt-1")}
              >
                <option value="">All day</option>
                {PERIOD_NAMES.map((period, index) => (
                  <option key={period} value={index}>
                    {period}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void addHoliday()}
              disabled={busy !== null}
              className="mt-5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </Section>
      )}

      {section === "calendar" && (
        <Section
          title="University calendar"
          hint="The term timeline the solver plans against."
          icon={<CalendarRange className="h-4 w-4 text-blue-600" />}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Faculty deadline", overview.term.deadline, "All constraints and preferences due"],
              ["Term start", overview.term.start_date, "Teaching begins"],
              ["Exam week", overview.term.exam_week_start, "Final assessment window"],
              ["Term end", overview.term.end_date, `${overview.term.weeks} weeks total`],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                  {value ? new Date(value).toLocaleDateString() : "—"}
                </div>
                <div className="text-[10px] text-slate-500">{hint}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Closures in this term</div>
            {overview.holidays.length === 0 ? (
              <p className="text-[11px] text-slate-500">None.</p>
            ) : (
              overview.holidays.map((entry, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]">
                  <span className="font-bold text-slate-900">{entry.label}</span>
                  <span className="font-mono text-slate-500">
                    {DAY_NAMES[entry.day]}
                    {entry.period !== undefined && entry.period !== null ? ` ${PERIOD_NAMES[entry.period]}` : " (all day)"}
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>
      )}

      {section === "settings" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section
            title="Term settings"
            hint="Name, deadline and length. Saved to Postgres with the rest of the institution."
            icon={<Settings className="h-4 w-4 text-slate-600" />}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Term name
                <input value={term} onChange={(e) => setTerm(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Weeks
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Opens
                <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Deadline
                <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
            </div>
            <button
              onClick={() => void saveWindow()}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
            >
              Save settings
            </button>
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
              <strong>Persistent institution:</strong> stored in Postgres 18. The university does
              not re-upload the same data each term; use the update box to replace or extend it.
            </div>
          </Section>
          <Section
            title="Update institution data"
            hint="Paste an updated catalog / faculty / room / degree-map dump. It becomes the current model and is saved."
            icon={<RefreshCw className="h-4 w-4 text-blue-600" />}
          >
            <textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              rows={9}
              spellCheck={false}
              placeholder="Paste updated institution data (courses, faculty, rooms, cohorts, degree maps)…"
              className={cn(FIELD, "font-mono text-[10px]")}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => void uploadUpdate()}
                disabled={uploadBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Update &amp; save
              </button>
              <span className="text-[10px] text-slate-500">Existing entities are replaced by the upload.</span>
            </div>
          </Section>
        </div>
      )}

      {section === "save" && (
        <Section
          title="Save schedule options"
          hint="Defaults the solver and publish flow use for this term. Persisted with the term."
          icon={<Save className="h-4 w-4 text-emerald-600" />}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Solver engine
              <select value={engine} onChange={(e) => setEngine(e.target.value)} className={cn(FIELD, "mt-1")}>
                <option value="cpsat">OR-Tools CP-SAT</option>
                <option value="ours">ScheduleSolve native</option>
                <option value="greedy">Greedy descent (fast)</option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Objective
              <select value={objective} onChange={(e) => setObjective(e.target.value)} className={cn(FIELD, "mt-1")}>
                <option value="preference">Faculty preferences</option>
                <option value="building_balance">Building utilization balance</option>
                <option value="room_fit">Room fit (least wasted seats)</option>
                <option value="balanced_load">Faculty load balance</option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Term start
              <input type="datetime-local" value={termStart} onChange={(e) => setTermStart(e.target.value)} className={cn(FIELD, "mt-1")} />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Term end
              <input type="datetime-local" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} className={cn(FIELD, "mt-1")} />
            </label>
            <label className="mt-5 inline-flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Auto-publish after solve
            </label>
          </div>
          <button
            onClick={() => void saveOptions()}
            disabled={busy !== null}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy === "save-options" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save schedule options
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Saved: engine <strong>{String((window.options ?? {}).engine ?? "cpsat")}</strong>,
            objective <strong>{String((window.options ?? {}).objective ?? "preference")}</strong>,
            auto-publish <strong>{String(Boolean((window.options ?? {}).auto_publish))}</strong>.
          </p>
        </Section>
      )}

      {/* Edit modal */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <button aria-label="Close" onClick={() => setEdit(null)} className="absolute inset-0 h-full w-full cursor-default" />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                Edit {edit.kind} · <span className="font-mono text-slate-500">{edit.id}</span>
              </h3>
              <button onClick={() => setEdit(null)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {edit.kind === "building" && (
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Name
                  <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(FIELD, "mt-1")} />
                </label>
              )}
              {edit.kind === "room" && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Name
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Capacity
                      <input
                        type="number"
                        min={1}
                        value={edit.capacity}
                        onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Type
                      <select
                        value={edit.room_type}
                        onChange={(e) => setEdit({ ...edit, room_type: e.target.value })}
                        className={cn(FIELD, "mt-1")}
                      >
                        <option value="lecture">lecture</option>
                        <option value="lab">lab</option>
                        <option value="seminar">seminar</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Building
                    <select
                      value={edit.building_id}
                      onChange={(e) => setEdit({ ...edit, building_id: e.target.value })}
                      className={cn(FIELD, "mt-1")}
                    >
                      {overview.buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Equipment (comma separated)
                    <input
                      value={edit.equipment}
                      onChange={(e) => setEdit({ ...edit, equipment: e.target.value })}
                      className={cn(FIELD, "mt-1")}
                    />
                  </label>
                </>
              )}
              {edit.kind === "instructor" && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Name
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Max sections
                      <input
                        type="number"
                        min={0}
                        value={edit.max_sections}
                        onChange={(e) => setEdit({ ...edit, max_sections: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Max preps
                      <input
                        type="number"
                        min={0}
                        value={edit.max_preps}
                        onChange={(e) => setEdit({ ...edit, max_preps: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Qualified course IDs (comma separated)
                    <input
                      value={edit.qualified}
                      onChange={(e) => setEdit({ ...edit, qualified: e.target.value })}
                      className={cn(FIELD, "mt-1")}
                    />
                  </label>
                </>
              )}
              {edit.kind === "cohort" && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Name
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Size
                      <input
                        type="number"
                        min={0}
                        value={edit.size}
                        onChange={(e) => setEdit({ ...edit, size: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Current term
                      <input
                        type="number"
                        min={0}
                        value={edit.current_term}
                        onChange={(e) => setEdit({ ...edit, current_term: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Program
                    <select
                      value={edit.program_id}
                      onChange={(e) => setEdit({ ...edit, program_id: e.target.value })}
                      className={cn(FIELD, "mt-1")}
                    >
                      {overview.degree_maps.programs.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {edit.kind === "program" && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Name
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Roadmap JSON
                    <textarea
                      value={edit.roadmap}
                      onChange={(e) => setEdit({ ...edit, roadmap: e.target.value })}
                      rows={10}
                      spellCheck={false}
                      className={cn(FIELD, "mt-1 font-mono text-[10px]")}
                    />
                  </label>
                </>
              )}
              {edit.kind === "course" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Code
                      <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className={cn(FIELD, "mt-1")} />
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Seats
                      <input
                        type="number"
                        min={1}
                        value={edit.seats}
                        onChange={(e) => setEdit({ ...edit, seats: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      />
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Title
                    <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Pattern
                      <select
                        value={edit.pattern}
                        onChange={(e) => setEdit({ ...edit, pattern: e.target.value })}
                        className={cn(FIELD, "mt-1")}
                      >
                        <option value="MWF">MWF</option>
                        <option value="TTh">TTh</option>
                        <option value="block">block (3h)</option>
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Room type
                      <select
                        value={edit.room_type}
                        onChange={(e) => setEdit({ ...edit, room_type: e.target.value })}
                        className={cn(FIELD, "mt-1")}
                      >
                        <option value="lecture">lecture</option>
                        <option value="lab">lab</option>
                        <option value="seminar">seminar</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Equipment (comma separated)
                    <input
                      value={edit.equipment}
                      onChange={(e) => setEdit({ ...edit, equipment: e.target.value })}
                      className={cn(FIELD, "mt-1")}
                    />
                  </label>
                </>
              )}
              {edit.kind === "closure" && (
                <>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Label
                    <input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} className={cn(FIELD, "mt-1")} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Day
                      <select
                        value={edit.day}
                        onChange={(e) => setEdit({ ...edit, day: Number(e.target.value) })}
                        className={cn(FIELD, "mt-1")}
                      >
                        {DAY_NAMES.map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Period
                      <select
                        value={edit.period}
                        onChange={(e) => setEdit({ ...edit, period: e.target.value })}
                        className={cn(FIELD, "mt-1")}
                      >
                        <option value="">All day</option>
                        {PERIOD_NAMES.map((period, index) => (
                          <option key={period} value={index}>
                            {period}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              {edit.kind === "constraint" && (
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Walk limit (minutes)
                  <input
                    type="number"
                    min={0}
                    value={edit.value}
                    onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })}
                    className={cn(FIELD, "mt-1")}
                  />
                </label>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEdit(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === "save-edit" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
