"use client";

// Coordinator role preview: walk the instructor or student experience with the
// live timetable, without signing out and without any write access.

import { useEffect, useMemo, useState } from "react";
import { Eye, GraduationCap, BookOpenCheck, Loader2, Users } from "lucide-react";
import { authFetch, type AuthUser } from "@/lib/auth";
import { TimetableGrid } from "@/components/timetable-grid";
import { DeliverablesView } from "@/components/views/deliverables";
import { cn } from "@/lib/utils";
import type { Placement, Scenario } from "@/types";

export type PreviewRole = "instructor" | "student";

export function RolePreviewView({
  role,
  user,
  onToast,
  onExit,
}: {
  role: PreviewRole;
  user: AuthUser;
  onToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
  onExit: () => void;
}) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState("");
  const [cohortId, setCohortId] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const scRes = await authFetch("/api/scenario");
        if (!scRes.ok) throw new Error("The institution model is unavailable.");
        const sc = (await scRes.json()) as Scenario;
        if (!live) return;
        setScenario(sc);
        setInstructorId(sc.instructors[0]?.id ?? "");
        setCohortId(sc.cohorts[0]?.id ?? "");

        let next: Placement[] = [];
        const current = await authFetch("/api/schedule/current");
        if (current.ok) {
          const data = await current.json();
          next = data.timetable?.placements ?? [];
          setStatus(data.status ?? "");
        }
        if (next.length === 0) {
          const solved = await authFetch("/api/solve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ engine: "cpsat" }),
          });
          const data = await solved.json();
          if (!solved.ok) throw new Error(data.detail || data.error || "Could not build a preview timetable.");
          next = data.timetable?.placements ?? [];
          setStatus(data.status ?? "");
        }
        if (live) setPlacements(next);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load the preview.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const instructor = useMemo(
    () => scenario?.instructors.find((row) => row.id === instructorId) ?? null,
    [scenario, instructorId],
  );
  const cohort = useMemo(
    () => scenario?.cohorts.find((row) => row.id === cohortId) ?? null,
    [scenario, cohortId],
  );

  const cohortCourseIds = useMemo(() => {
    if (!scenario || !cohort) return new Set<string>();
    const program = scenario.programs.find((row) => row.id === cohort.program_id);
    const requirements = program?.roadmap?.[String(cohort.current_term)] ?? [];
    return new Set(requirements.map((requirement) => requirement.course_id));
  }, [scenario, cohort]);

  const visible = useMemo(() => {
    if (role === "instructor") {
      return placements.filter((placement) => placement.instructor_id === instructorId);
    }
    return placements.filter((placement) => cohortCourseIds.has(placement.course_id));
  }, [placements, role, instructorId, cohortCourseIds]);

  const previewUser: AuthUser = {
    ...user,
    role,
    instructor_id: role === "instructor" ? instructorId : user.instructor_id,
    cohort_id: role === "student" ? cohortId : user.cohort_id,
    display_name: role === "instructor" ? (instructor?.name ?? "Preview instructor") : (cohort?.name ?? "Preview student"),
  };

  const nextAction = role === "instructor"
    ? "Review their timetable, workload and the intake request they can send."
    : "Review their cohort timetable, degree progress and the advising plan they receive.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <Eye className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Read-only preview</p>
            <p className="truncate text-sm font-extrabold text-slate-900">
              {role === "instructor" ? "Instructor experience" : "Student experience"}
            </p>
            <p className="text-xs text-slate-600">{nextAction}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="inline-flex min-h-9 items-center rounded-lg bg-violet-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-violet-700"
        >
          Back to coordinator
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Building the {role} view from the live timetable…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">This preview could not load.</p>
          <p className="mt-1">{error}</p>
          <button onClick={onExit} className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">
            Back to coordinator
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight">
                {role === "instructor" ? <BookOpenCheck className="h-4 w-4 text-primary" /> : <GraduationCap className="h-4 w-4 text-primary" />}
                {role === "instructor" ? "Teaching timetable" : "Cohort timetable"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {visible.length} section{visible.length === 1 ? "" : "s"} · {status || "live solve"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {role === "instructor" ? "Instructor" : "Cohort"}
              <select
                value={role === "instructor" ? instructorId : cohortId}
                onChange={(event) => role === "instructor" ? setInstructorId(event.target.value) : setCohortId(event.target.value)}
                className="min-h-9 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(role === "instructor" ? scenario?.instructors ?? [] : scenario?.cohorts ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm sm:p-3">
            {visible.length > 0 ? (
              <TimetableGrid placements={visible} compact={role === "instructor"} />
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Nothing assigned here yet</p>
                <p>Pick another {role === "instructor" ? "instructor" : "cohort"} or publish the term first.</p>
              </div>
            )}
          </div>

          {role === "instructor" && instructor && (
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "Sections", value: `${visible.length} / ${instructor.max_sections}`, hint: "assigned vs contract cap" },
                { label: "Preps", value: `${new Set(visible.map((row) => row.course_id)).size} / ${instructor.max_preps}`, hint: "distinct courses" },
                { label: "Qualified", value: `${instructor.qualified_courses.length}`, hint: "courses they can teach" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  <p className="mt-0.5 text-lg font-black tabular-nums">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.hint}</p>
                </div>
              ))}
            </div>
          )}

          <div className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", role === "student" && "border-blue-100")}>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
              What this role sees next
            </p>
            <DeliverablesView user={previewUser} onToast={onToast} />
          </div>
        </>
      )}
    </div>
  );
}
