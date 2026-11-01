// Deliverables: join a placed timetable with the institution model so each
// role's output can be rendered from real data (no demo numbers).
//
// Everything here is pure: the view fetches the scenario, the timetable and the
// intelligence reports, then these helpers derive proof metrics, preference
// match, equipment readiness and the per-role rows.

import {
  DAY_NAMES,
  DAY_NAMES_SHORT,
  type Building,
  type Cohort,
  type Course,
  type Instructor,
  type MarginsReport,
  type Placement,
  type Room,
  type Scenario,
  type UtilizationReport,
} from "@/types";

export type TimeWindow = "Morning" | "Afternoon" | "Evening";

// The live inputs every role deliverable is rendered from. The first-page
// preview and the signed-in Deliverables view share this exact shape, so the
// preview is the app rather than a mock of it.
export interface DeliverablesData {
  scenario: Scenario;
  placements: Placement[];
  utilization: UtilizationReport | null;
  margins: MarginsReport | null;
  source: "published" | "live";
  status: string;
}

export interface DeliverableRow {
  sectionId: string;
  courseId: string;
  code: string;
  title: string;
  dept: string;
  pattern: string;
  roomType: string;
  instructorId: string;
  instructorName: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  days: number[];
  dayLabel: string;
  dayShort: string;
  start: string;
  end: string;
  duration: number;
  window: TimeWindow;
  enrollment?: number;
  equipmentOk: boolean;
  missingEquipment: string[];
}

export function timeWindow(start?: string): TimeWindow {
  const hour = Number((start ?? "0").split(":")[0]);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function formatDays(days: number[], short = false): string {
  const names = short ? DAY_NAMES_SHORT : DAY_NAMES;
  return days.map((d) => names[d] ?? "?").join(short ? "" : ", ");
}

export function buildRows(scenario: Scenario, placements: Placement[]): DeliverableRow[] {
  const courses = new Map(scenario.courses.map((c) => [c.id, c]));
  const rooms = new Map(scenario.rooms.map((r) => [r.id, r]));
  const buildings = new Map(scenario.buildings.map((b) => [b.id, b]));

  return placements.map((p) => {
    const course = courses.get(p.course_id);
    const room = rooms.get(p.room_id);
    const required = course?.equipment ?? [];
    const available = room?.equipment ?? [];
    const missing = required.filter((item) => !available.includes(item));
    return {
      sectionId: p.section_id,
      courseId: p.course_id,
      code: p.course_code,
      title: course?.title ?? "",
      dept: (p.course_code.split(" ")[0] || "GEN").toUpperCase(),
      pattern: course?.pattern ?? "",
      roomType: course?.room_type ?? room?.room_type ?? "",
      instructorId: p.instructor_id,
      instructorName: p.instructor_name,
      roomId: p.room_id,
      roomName: p.room_name,
      buildingId: p.building_id,
      buildingName: buildings.get(p.building_id)?.name ?? p.building_id,
      days: p.days,
      dayLabel: formatDays(p.days),
      dayShort: formatDays(p.days, true),
      start: p.start_time ?? "",
      end: p.end_time ?? "",
      duration: p.duration ?? 1.5,
      window: timeWindow(p.start_time),
      enrollment: p.enrollment,
      equipmentOk: missing.length === 0,
      missingEquipment: missing,
    };
  });
}

// --- preference + constraint satisfaction ----------------------------------

export interface PreferenceMetrics {
  hard: number; // 100 = no hard-unavailability violations
  time: number; // day/period preferences honoured
  course: number; // course preferences honoured
  travel: number; // consecutive classes within the walking limit
  soft: number; // weight-aware preference score
  overall: number;
  satisfied: number;
  total: number;
  sections: number;
  violations: string[];
}

const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function instructorMetrics(
  scenario: Scenario,
  placements: Placement[],
  instructorId: string
): PreferenceMetrics {
  const instructor = scenario.instructors.find((i) => i.id === instructorId);
  const mine = placements.filter((p) => p.instructor_id === instructorId);
  const violations: string[] = [];

  if (!instructor) {
    return { hard: 100, time: 100, course: 100, travel: 100, soft: 100, overall: 100, satisfied: 0, total: 0, sections: 0, violations };
  }

  // Hard unavailability (C14): a placed section must never land in a blackout.
  let hardViolations = 0;
  for (const p of mine) {
    const periods = p.periods ?? (p.period !== undefined ? [p.period] : []);
    for (const slot of instructor.hard_unavailable) {
      const dayHit = p.days.includes(slot.day);
      const periodHit = slot.period === undefined || slot.period === null || periods.includes(slot.period);
      if (dayHit && periodHit) {
        hardViolations += 1;
        violations.push(`${p.course_code} overlaps a hard blackout (${DAY_NAMES[slot.day]} ${slot.period !== undefined && slot.period !== null ? slot.period : "all day"})`);
      }
    }
  }
  const hard = mine.length === 0 ? 100 : clampPct(100 * (1 - hardViolations / mine.length));

  const satisfies = (pref: Instructor["preferences"][number]): boolean => {
    if (pref.course_id) {
      const has = mine.some((p) => p.course_id === pref.course_id);
      return pref.kind === "prefer" ? has : !has;
    }
    const hit = mine.some((p) => {
      const dayHit = pref.day === undefined || pref.day === null || p.days.includes(pref.day);
      const periods = p.periods ?? (p.period !== undefined ? [p.period] : []);
      const periodHit = pref.period === undefined || pref.period === null || periods.includes(pref.period);
      return dayHit && periodHit;
    });
    return pref.kind === "prefer" ? hit : !hit;
  };

  const timePrefs = instructor.preferences.filter((p) => !p.course_id);
  const coursePrefs = instructor.preferences.filter((p) => p.course_id);
  const timeHit = timePrefs.filter(satisfies).length;
  const courseHit = coursePrefs.filter(satisfies).length;
  const weightTotal = instructor.preferences.reduce((sum, p) => sum + Math.abs(p.weight), 0);
  const weightHit = instructor.preferences.reduce((sum, p) => sum + (satisfies(p) ? Math.abs(p.weight) : 0), 0);

  const time = timePrefs.length === 0 ? 100 : clampPct((100 * timeHit) / timePrefs.length);
  const course = coursePrefs.length === 0 ? 100 : clampPct((100 * courseHit) / coursePrefs.length);
  const soft = weightTotal === 0 ? 100 : clampPct((100 * weightHit) / weightTotal);

  // Walking limit: consecutive classes on the same day must be reachable.
  const byDay = new Map<number, Placement[]>();
  for (const p of mine) {
    for (const day of p.days) {
      const list = byDay.get(day) ?? [];
      list.push(p);
      byDay.set(day, list);
    }
  }
  let transitions = 0;
  let within = 0;
  byDay.forEach((list) => {
    const ordered = [...list].sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
    for (let i = 1; i < ordered.length; i++) {
      const from = ordered[i - 1].building_id;
      const to = ordered[i].building_id;
      const walk = scenario.distances?.[from]?.[to] ?? 0;
      transitions += 1;
      if (walk <= scenario.walk_limit_min) within += 1;
      else violations.push(`${DAY_NAMES[ordered[i].days[0]]}: ${from} → ${to} is ${walk} min (limit ${scenario.walk_limit_min})`);
    }
  });
  const travel = transitions === 0 ? 100 : clampPct((100 * within) / transitions);

  const satisfied = timeHit + courseHit;
  const total = timePrefs.length + coursePrefs.length;

  return {
    hard,
    time,
    course,
    travel,
    soft,
    overall: clampPct((hard + time + course + travel + soft) / 5),
    satisfied,
    total,
    sections: mine.length,
    violations,
  };
}

export function aggregateMetrics(list: PreferenceMetrics[]): PreferenceMetrics {
  if (list.length === 0) {
    return { hard: 100, time: 100, course: 100, travel: 100, soft: 100, overall: 100, satisfied: 0, total: 0, sections: 0, violations: [] };
  }
  const avg = (key: keyof PreferenceMetrics) =>
    clampPct(list.reduce((sum, m) => sum + Number(m[key]), 0) / list.length);
  return {
    hard: avg("hard"),
    time: avg("time"),
    course: avg("course"),
    travel: avg("travel"),
    soft: avg("soft"),
    overall: avg("overall"),
    satisfied: list.reduce((sum, m) => sum + m.satisfied, 0),
    total: list.reduce((sum, m) => sum + m.total, 0),
    sections: list.reduce((sum, m) => sum + m.sections, 0),
    violations: list.flatMap((m) => m.violations),
  };
}

// --- aggregate proof metrics ------------------------------------------------

export interface BuildingUtilization {
  id: string;
  name: string;
  capacity: number;
  peakSeats: number;
  utilization: number;
}

export function buildingUtilization(
  scenario: Scenario,
  report: UtilizationReport | null
): BuildingUtilization[] {
  if (!report) return [];
  const rooms = new Map(scenario.rooms.map((r) => [r.id, r]));
  const buildings = new Map(scenario.buildings.map((b) => [b.id, b]));
  const acc = new Map<string, { capacity: number; peak: number }>();
  report.rooms.forEach((entry) => {
    const room = rooms.get(entry.room_id);
    if (!room) return;
    const current = acc.get(room.building_id) ?? { capacity: 0, peak: 0 };
    current.capacity += entry.capacity;
    current.peak += entry.peak_seats;
    acc.set(room.building_id, current);
  });
  return [...acc.entries()]
    .map(([id, value]) => ({
      id,
      name: buildings.get(id)?.name ?? id,
      capacity: value.capacity,
      peakSeats: value.peak,
      utilization: value.capacity > 0 ? Math.round((100 * value.peak) / value.capacity) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization);
}

export interface ProofMetrics {
  peakUtilization: number;
  facility: BuildingUtilization[];
  facultyWithinCap: number;
  facultyTotal: number;
  allLoadsMet: boolean;
  prefMatch: number;
  marginsOk: boolean;
  marginShortfalls: number;
  minCourses: number;
  walkLimit: number;
  eveningSections: number;
  sections: number;
}

export function proofMetrics(
  scenario: Scenario,
  placements: Placement[],
  rows: DeliverableRow[],
  utilization: UtilizationReport | null,
  margins: MarginsReport | null,
  prefs: PreferenceMetrics
): ProofMetrics {
  const facility = buildingUtilization(scenario, utilization);
  const faculty = utilization?.faculty ?? [];
  return {
    peakUtilization: facility.reduce((max, b) => Math.max(max, b.utilization), 0),
    facility,
    facultyWithinCap: faculty.filter((f) => f.satisfied).length,
    facultyTotal: faculty.length || scenario.instructors.length,
    allLoadsMet: utilization?.all_loads_met ?? false,
    prefMatch: prefs.soft,
    marginsOk: margins?.all_ok ?? false,
    marginShortfalls: margins ? margins.cohorts.filter((c) => !c.ok).length : 0,
    minCourses: margins?.min_courses ?? 4,
    walkLimit: scenario.walk_limit_min,
    eveningSections: rows.filter((r) => r.window === "Evening").length,
    sections: placements.length,
  };
}

// --- per-role plans ---------------------------------------------------------

export interface PlanCourse {
  courseId: string;
  code: string;
  title: string;
  required: boolean;
  seats: number;
  placement?: Placement;
  row?: DeliverableRow;
  conflictFree: boolean;
}

export interface CohortPlan {
  cohort: Cohort;
  courses: PlanCourse[];
  requiredCount: number;
  electiveCount: number;
  eveningCount: number;
  dayCount: number;
  guaranteeOk: boolean;
  guaranteeMargin: number;
  minCourses: number;
}

function overlaps(a: Placement, b: Placement): boolean {
  if (!a.days.some((d) => b.days.includes(d))) return false;
  const ap = a.periods ?? (a.period !== undefined ? [a.period] : []);
  const bp = b.periods ?? (b.period !== undefined ? [b.period] : []);
  return ap.some((p) => bp.includes(p));
}

export function cohortPlan(
  scenario: Scenario,
  placements: Placement[],
  cohort: Cohort,
  margins: MarginsReport | null
): CohortPlan {
  const program = scenario.programs.find((p) => p.id === cohort.program_id);
  const roadmap = program?.roadmap?.[String(cohort.current_term)] ?? [];
  const courses = new Map(scenario.courses.map((c) => [c.id, c]));
  const rows = buildRows(scenario, placements);
  const rowBySection = new Map(rows.map((r) => [r.sectionId, r]));

  const plan = roadmap.map((req) => {
    const course = courses.get(req.course_id);
    const placement = placements.find((p) => p.course_id === req.course_id);
    return {
      courseId: req.course_id,
      code: course?.code ?? req.course_id,
      title: course?.title ?? "",
      required: req.required,
      seats: course?.seats ?? 0,
      placement,
      row: placement ? rowBySection.get(placement.section_id) : undefined,
      conflictFree: true,
    };
  });

  // Conflict audit inside the plan (overlapping day + period).
  plan.forEach((course, index) => {
    if (!course.placement) {
      course.conflictFree = false;
      return;
    }
    for (let j = 0; j < plan.length; j++) {
      if (j === index) continue;
      const other = plan[j].placement;
      if (other && overlaps(course.placement, other)) course.conflictFree = false;
    }
  });

  const margin = margins?.cohorts.find((c) => c.cohort_id === cohort.id);
  const eveningCount = plan.filter((c) => c.row?.window === "Evening").length;

  return {
    cohort,
    courses: plan,
    requiredCount: plan.filter((c) => c.required).length,
    electiveCount: plan.filter((c) => !c.required).length,
    eveningCount,
    dayCount: plan.length - eveningCount,
    guaranteeOk: margin?.ok ?? false,
    guaranteeMargin: margin?.margin ?? 0,
    minCourses: margins?.min_courses ?? 4,
  };
}

// --- export -----------------------------------------------------------------

export function rowsToCsv(rows: DeliverableRow[]): string {
  const header = [
    "Course Code",
    "Title",
    "Dept",
    "Instructor",
    "Facility",
    "Building",
    "Days",
    "Start",
    "End",
    "Window",
    "Room Type",
    "Equipment",
    "Proof",
  ];
  const body = rows.map((r) => [
    r.code,
    r.title,
    r.dept,
    r.instructorName,
    r.roomName,
    r.buildingName,
    r.dayShort,
    r.start,
    r.end,
    r.window,
    r.roomType,
    r.equipmentOk ? "ready" : `missing: ${r.missingEquipment.join("/")}`,
    "SOLVER-PROVEN",
  ]);
  return [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- small lookups used by the view ----------------------------------------

export function courseLookup(scenario: Scenario): Map<string, Course> {
  return new Map(scenario.courses.map((c) => [c.id, c]));
}
export function roomLookup(scenario: Scenario): Map<string, Room> {
  return new Map(scenario.rooms.map((r) => [r.id, r]));
}
export function buildingLookup(scenario: Scenario): Map<string, Building> {
  return new Map(scenario.buildings.map((b) => [b.id, b]));
}
