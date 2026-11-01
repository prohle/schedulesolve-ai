"use client";

// Visual timetable: days x periods, one colored block per section. This is the
// demo's "the timetable morphs" surface — the table below it is for detail.

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { DAY_NAMES, PERIOD_NAMES, type Placement } from "@/types";

function hue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function colors(id: string) {
  const h = hue(id);
  return {
    background: `hsl(${h} 72% 94%)`,
    borderColor: `hsl(${h} 52% 72%)`,
    color: `hsl(${h} 42% 26%)`,
  };
}

function shortName(name: string): string {
  const parts = name.replace(/^(Dr\.|Prof\.)\s+/i, "").split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function Block({ placement, changed, compact }: {
  placement: Placement;
  changed?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-md border px-1.5 py-1 flex flex-col justify-between overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px hover:brightness-[1.03]",
        changed && "ring-2 ring-amber-400 ring-offset-1 shadow-md"
      )}
      style={colors(placement.course_id)}
      title={`${placement.course_code} · ${placement.instructor_name} · ${placement.room_name}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-extrabold leading-tight truncate">
          {placement.course_code}
          {compact && (
            <span className="ml-1 text-[9px] font-semibold opacity-75">
              {shortName(placement.instructor_name)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {placement.periods.length > 1 && (
            <span className="text-[8px] font-bold text-muted-foreground">3h</span>
          )}
          {changed && (
            <span className="text-[8px] font-bold uppercase tracking-wide text-amber-700">
              changed
            </span>
          )}
        </span>
      </div>
      {!compact && (
        <>
          <div className="text-[10px] font-medium leading-tight truncate">
            {shortName(placement.instructor_name)}
          </div>
          <div className="text-[9px] leading-tight opacity-70 truncate">
            {placement.room_name}
          </div>
        </>
      )}
    </div>
  );
}

export function TimetableGrid({ placements, changed, compact }: {
  placements: Placement[];
  changed?: Set<string>;
  compact?: boolean;
}) {
  // A cell can hold sections from different cohorts (they may legitimately
  // overlap). Keep a list and render up to two stacked, with a +N overflow.
  const cells: Record<string, Placement[]> = {};
  const add = (key: string, placement: Placement) => {
    (cells[key] ??= []).push(placement);
  };
  for (const p of placements) {
    if (p.period == null) {
      // A weekly block starts in its first period; the 3h badge carries the
      // rest of the duration without hiding a different section underneath.
      for (const day of p.days) add(`${day}-${p.periods[0]}`, p);
      continue;
    }
    for (const day of p.days) add(`${day}-${p.period}`, p);
  }

  const courses = Array.from(
    new Map(placements.map((p) => [p.course_id, p.course_code])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="space-y-2">
      <div className="custom-scrollbar overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div
          className="grid min-w-[430px] gap-px overflow-hidden rounded-2xl bg-border p-px sm:min-w-[520px]"
          style={{
            gridTemplateColumns: "44px repeat(5, minmax(0, 1fr))",
            gridTemplateRows: `28px repeat(${PERIOD_NAMES.length}, ${compact ? "60px" : "84px"})`,
          }}
        >
          <div className="bg-slate-100" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAY_NAMES.map((day, i) => (
            <div
              key={day}
              className="flex items-center justify-center bg-slate-100 px-0.5 text-[10px] font-extrabold tracking-widest text-slate-600 uppercase"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              <span className="sm:hidden">{day.slice(0, 3)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}

          {PERIOD_NAMES.map((label, period) => (
            <Fragment key={period}>
              <div
                className="bg-muted/40 flex items-center justify-center text-[10px] font-mono text-muted-foreground"
                style={{ gridColumn: 1, gridRow: period + 2 }}
              >
                {label}
              </div>
              {DAY_NAMES.map((_, day) => {
                const list = cells[`${day}-${period}`] ?? [];
                return (
                  <div
                    key={day}
                    className="bg-card p-1 min-h-0"
                    style={{ gridColumn: day + 2, gridRow: period + 2 }}
                  >
                    <div className="flex h-full flex-col gap-0.5">
                      {list.slice(0, 2).map((placement) => (
                        <div key={placement.section_id} className="flex-1 min-h-0">
                          <Block
                            placement={placement}
                            changed={changed?.has(placement.section_id)}
                            compact={compact || list.length > 1}
                          />
                        </div>
                      ))}
                      {list.length > 2 && (
                        <div className="text-[9px] font-bold text-muted-foreground">
                          +{list.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}

        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {courses.map(([id, code]) => (
          <span key={id} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm border" style={colors(id)} />
            {code}
          </span>
        ))}
        {changed && changed.size > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm ring-2 ring-amber-400" />
            changed this action
          </span>
        )}
      </div>
    </div>
  );
}

export function changedSections(before: Placement[], after: Placement[]): Set<string> {
  const key = (p: Placement) =>
    [p.instructor_id, p.room_id, p.period, [...p.days].sort().join(","), [...p.periods].sort().join(",")].join("|");
  const old = new Map(before.map((p) => [p.section_id, key(p)]));
  return new Set(after.filter((p) => old.get(p.section_id) !== key(p)).map((p) => p.section_id));
}
