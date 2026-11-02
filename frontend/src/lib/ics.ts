// Calendar export — the last mile for a published timetable.
//
// A coordinator, instructor or student can drop the solver-proven timetable
// into Google Calendar / Outlook. Weekly VEVENTs carry the room, instructor
// and section; term holidays and closures become EXDATEs so a cancelled
// class does not reappear in someone's calendar.

import type { Placement } from "@/types";

export interface CalendarDay {
  date: string;
  weekday: number;
  effective_weekday: number;
  status: string;
  label?: string;
}

export interface TermCalendar {
  start_date?: string;
  end_date?: string;
  weeks?: number;
  days?: CalendarDay[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function localStamp(date: Date, hours: number, minutes: number) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(hours)}${pad(minutes)}00`;
}

function utcStamp(date = new Date()) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function parseClock(value?: string): { hours: number; minutes: number } | null {
  if (!value) return null;
  const [h, m] = value.split(":").map((x) => Number(x));
  if (!Number.isFinite(h)) return null;
  return { hours: h, minutes: Number.isFinite(m) ? m : 0 };
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

export function buildTimetableIcs({
  placements,
  calendar,
  calendarName,
}: {
  placements: Placement[];
  calendar: TermCalendar | null;
  calendarName: string;
}): string {
  const start = calendar?.start_date
    ? new Date(`${calendar.start_date}T00:00:00`)
    : nextMonday();
  const end = calendar?.end_date
    ? new Date(`${calendar.end_date}T23:59:59`)
    : new Date(start.getTime() + 15 * 7 * 86_400_000);
  const weeks = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (7 * 86_400_000)) + 1);
  const closed = (calendar?.days ?? []).filter((d) => d.status !== "class");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScheduleSolve AI//Solver-proven timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];

  for (const placement of placements) {
    const from = parseClock(placement.start_time);
    const to = parseClock(placement.end_time);
    if (!from || !to) continue;
    for (const day of placement.days) {
      // ScheduleSolve weekdays are 0=Monday…4=Friday; JS getDay() is 0=Sunday.
      const offset = ((day + 1) - start.getDay() + 7) % 7;
      const first = new Date(start);
      first.setDate(start.getDate() + offset);
      if (first > end) continue;

      const exdates = closed
        .filter((d) => d.effective_weekday === day)
        .map((d) => `${d.date.replace(/-/g, "")}T${pad(from.hours)}${pad(from.minutes)}00`);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${placement.section_id}-${day}@schedulesolve.ai`,
        `DTSTAMP:${utcStamp()}`,
        `DTSTART:${localStamp(first, from.hours, from.minutes)}`,
        `DTEND:${localStamp(first, to.hours, to.minutes)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
        ...(exdates.length ? [`EXDATE:${exdates.join(",")}`] : []),
        `SUMMARY:${escapeIcs(`${placement.course_code} · ${placement.instructor_name}`)}`,
        `LOCATION:${escapeIcs(placement.room_name)}`,
        `DESCRIPTION:${escapeIcs(
          `Solver-proven placement · section ${placement.section_id}` +
          (placement.duration ? ` · ${placement.duration}h` : "") +
          " · exported by ScheduleSolve AI",
        )}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
