"use client";

// Inline campus calendar matrix for the landing preview.
//
// Faithful, compact port of local-design/calendar-matrix-campus.html: context
// pills + time scrubber, KPI cards, collapsible analytics, heatmap legend,
// 12-building macro matrix and a room-by-room spatial grid, with the filter
// drawer, tooltips, blackout blocks and auto-scrub playback.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart2,
  BarChart3,
  ChevronUp,
  Flame,
  HelpCircle,
  Info,
  LineChart,
  Lock,
  Palette,
  Pause,
  Play,
  ShieldCheck,
  Sliders,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { EChart } from "@/components/ui/echart";
import {
  campusQuadFromRows,
  campusQuadOption,
  campusTrafficFromSeries,
  campusTrafficOption,
} from "./charts";
import {
  CAMPUSES,
  CAMPUS_ORDER,
  DAY_OPTIONS,
  SLOTS,
  WEEK_OPTIONS,
  activeBuildings,
  buildingSlot,
  generateRoomData,
  heatClass,
  policyMessage,
  roomName,
  summarizeMatrix,
  type Day,
  type Week,
} from "./campus-data";
import type { LiveCampus } from "@/lib/campus-live";

type ViewMode = "macro" | "micro";
type Wing = "all" | "A" | "B";

const FIELD =
  "w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600";

const PILL = "whitespace-nowrap rounded-lg border px-2.5 py-1 font-bold";

export function CampusMatrix({
  onToast,
  live,
}: {
  onToast: (message: string) => void;
  live?: LiveCampus | null;
}) {
  const [campus, setCampus] = useState<string>("all");
  const [building, setBuilding] = useState<string>("all");
  const [week, setWeek] = useState<Week>("3");
  const [day, setDay] = useState<Day>("wed");
  const [slot, setSlot] = useState<number | "all">(1);
  const [view, setView] = useState<ViewMode>("macro");
  const [floor, setFloor] = useState<string>("all");
  const [wing, setWing] = useState<Wing>("all");
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: React.ReactNode } | null>(null);

  const model = live?.campuses ?? CAMPUSES;
  const order = live?.order ?? CAMPUS_ORDER;
  const slots = live?.slots ?? SLOTS;
  const resolve = live?.resolve ?? generateRoomData;

  const list = useMemo(
    () => activeBuildings(campus, building, model, order),
    [campus, building, model, order]
  );
  const summary = useMemo(
    () => summarizeMatrix(list, week, day, resolve, slots),
    [list, week, day, resolve, slots]
  );
  const policy = live ? "Live placed term" : policyMessage(week, day);
  const activeSlotId = slot === "all" ? 1 : slot;
  const activeSlot = slots[activeSlotId] ?? slots[0];

  const trafficOption = useMemo(() => {
    if (!live) return campusTrafficOption;
    const palette = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b"];
    const series = list.map((item, index) => ({
      name: item.building.name.split("(")[0].trim(),
      color: palette[index % palette.length],
      data: slots.map(
        (entry) => buildingSlot(item.building, week, day, entry.id, resolve).count
      ),
    }));
    return campusTrafficFromSeries(slots.map((entry) => entry.short), series);
  }, [live, list, slots, week, day, resolve]);

  const quadOption = useMemo(
    () =>
      live
        ? campusQuadFromRows(
            summary.rows.map((row) => ({
              name: row.item.building.name.split("(")[0].trim(),
              percent: row.average,
            }))
          )
        : campusQuadOption,
    [live, summary]
  );

  const target = useMemo(() => {
    if (building !== "all") {
      const found = list.find((entry) => entry.building.id === building);
      if (found) return found;
    }
    return list[0];
  }, [building, list]);

  const activeFilterCount = [
    campus !== "all",
    building !== "all",
    week !== "3",
    day !== "wed",
    slot !== 1,
  ].filter(Boolean).length;

  // Auto-scrub playback: walks the seven slots until paused.
  useEffect(() => {
    if (!playing) return;
    let index = 0;
    const timer = window.setInterval(() => {
      setSlot(index);
      index = (index + 1) % slots.length;
    }, 1800);
    return () => window.clearInterval(timer);
  }, [playing, slots.length]);

  // Tooltip follows the cursor while a cell is hovered.
  useEffect(() => {
    if (!tip) return;
    function move(event: MouseEvent) {
      setTip((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    }
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [tip]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      setHelpOpen(false);
      setTip(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function changeCampus(next: string) {
    setCampus(next);
    setBuilding("all");
    setFloor("all");
    setWing("all");
  }

  function inspect(buildingId: string, slotId: number) {
    setBuilding(buildingId);
    setSlot(slotId);
    setView("micro");
    setTip(null);
    onToast(`Inspecting ${slots[slotId]?.label ?? "slot"} in the spatial grid`);
  }

  const scrubber = (
    <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
      <span className="pr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Slot:</span>
      {slots.map((entry) => {
        const active = slot === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSlot(entry.id)}
            className={`rounded-lg px-2.5 py-1 font-bold transition-all ${
              active
                ? "bg-blue-600 text-white shadow-xs"
                : entry.id === 3
                  ? "bg-slate-100 font-medium text-slate-400"
                  : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-blue-50"
            }`}
          >
            {entry.short}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative w-full">
      <div className="custom-scrollbar space-y-3 pr-1 sm:max-h-[640px] sm:overflow-y-auto">
        {/* Matrix toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 transition-all hover:bg-slate-200/80 active:scale-95"
          >
            <Sliders className="h-3.5 w-3.5 text-blue-600" />
            <span>Filters</span>
            <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeFilterCount} Active
            </span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setView("macro")}
                className={`rounded-lg px-2.5 py-1 text-xs transition-all ${
                  view === "macro" ? "bg-white font-bold text-blue-700 shadow-xs" : "font-semibold text-slate-600 hover:text-slate-900"
                }`}
              >
                Macro Matrix
              </button>
              <button
                type="button"
                onClick={() => setView("micro")}
                className={`rounded-lg px-2.5 py-1 text-xs transition-all ${
                  view === "micro" ? "bg-white font-bold text-blue-700 shadow-xs" : "font-semibold text-slate-600 hover:text-slate-900"
                }`}
              >
                Spatial Grid
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{playing ? "Pause" : "Auto-Scrub"}</span>
            </button>
          </div>
        </div>

        {/* Context bar */}
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-xs lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2 px-1 py-0.5 text-[11.5px]">
            <div className="flex items-center gap-1.5 font-extrabold text-slate-500">
              <span>CURRENT CONTEXT</span>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                title="What is Current Context?"
                className="text-slate-400 transition-colors hover:text-blue-600"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <span className="text-slate-300">:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`${PILL} border-slate-200 bg-slate-100 text-slate-800`}>
                {campus === "all" ? "All Quads" : (model[campus]?.name ?? campus).split("(")[0]}
              </span>
              <span className="text-slate-300">›</span>
              <span className={`${PILL} border-blue-200 bg-blue-50 text-blue-800`}>
                {building === "all" ? "All Buildings" : (target?.building.code ?? "—")}
              </span>
              <span className="text-slate-300">›</span>
              <span className={`${PILL} border-indigo-200 bg-indigo-50 text-indigo-800`}>
                {live ? "Live placed term" : `Week ${week}`}
              </span>
              <span className="text-slate-300">›</span>
              <span className={`${PILL} border-emerald-200 bg-emerald-50 text-emerald-800`}>
                {day.toUpperCase()}, {activeSlot.time.split("–")[0].trim()}
              </span>
            </div>
          </div>

          {scrubber}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "Campus Seat Occupancy",
              value: `${summary.utilization}%`,
              note: "Optimal Load",
              noteTone: "text-emerald-700",
              Icon: TrendingUp,
              iconTone: "text-emerald-600",
              box: "bg-blue-50 border-blue-100 text-blue-600",
            },
            {
              label: "Students In Class",
              value: `${summary.students.toLocaleString()} / ${summary.seats.toLocaleString()}`,
              note: `Peak Capacity ${summary.utilization}%`,
              noteTone: "text-blue-700",
              Icon: Users,
              iconTone: "text-blue-600",
              box: "bg-indigo-50 border-indigo-100 text-indigo-600",
            },
            {
              label: "Highest Load Building",
              value: `${summary.busiestName.split("(")[0].trim()} (${summary.busiestPercent}%)`,
              note: "Case Rooms Full",
              noteTone: "text-slate-500",
              Icon: Flame,
              iconTone: "text-amber-600",
              box: "bg-amber-50 border-amber-100 text-amber-600",
              valueTone: "text-amber-700 text-sm",
            },
            {
              label: "Active Policy / Blackout",
              value: policy,
              note: "100% Policy Enforced",
              noteTone: "text-emerald-700",
              Icon: ShieldCheck,
              iconTone: "text-emerald-600",
              box: "bg-purple-50 border-purple-100 text-purple-600",
              valueTone: "text-purple-900 text-xs",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs"
            >
              <div className="min-w-0">
                <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-500">
                  {kpi.label}
                </div>
                <div
                  className={`mt-0.5 text-sm font-black text-slate-900 sm:text-base ${
                    kpi.valueTone ? "leading-snug" : "truncate"
                  } ${kpi.valueTone ?? ""}`}
                  title={kpi.value}
                >
                  {kpi.value}
                </div>
                <div className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${kpi.noteTone}`}>
                  <kpi.Icon className={`h-3 w-3 ${kpi.iconTone}`} />
                  <span className="truncate">{kpi.note}</span>
                </div>
              </div>
              <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border 2xl:flex ${kpi.box}`}>
                <kpi.Icon className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-xs">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Palette className="h-4 w-4 text-blue-600" />
            <span>Heatmap Color Legend:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
            <span className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-950">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Vacant (&lt;40%)
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-sky-950">
              <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" /> Moderate (40–75%)
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-950">
              <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> High (75–90%)
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-rose-950">
              <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" /> Peak (&gt;90%)
            </span>
            <span className="pattern-blackout flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 font-bold text-purple-950">
              <span className="h-2.5 w-2.5 rounded-xs bg-purple-600" /> Blackout Block (Locked)
            </span>
          </div>
        </div>

        {/* MACRO MATRIX */}
        {view === "macro" ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col items-start justify-between gap-2 border-b border-slate-100 pb-2.5 sm:flex-row sm:items-center">
              <div>
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                  Side-by-Side Facility Matrix
                </span>
                <h2 className="mt-0.5 text-sm font-black text-slate-900">
                  Global {list.length}-Building Academic Occupancy Matrix
                </h2>
              </div>
              <div className="text-[10.5px] font-semibold text-slate-500">
                Click any cell to inspect room cards in spatial grid
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed border-collapse text-center text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-[9.5px] font-bold text-slate-700">
                    <th className="w-[24%] border-r border-slate-200 bg-slate-100 p-2 text-left">Quad &amp; Building</th>
                    {slots.map((entry) => (
                      <th
                        key={entry.id}
                        className={`border-r border-slate-200 p-1 ${entry.id === 3 ? "w-[10%]" : "w-[11%]"} ${
                          entry.id === 6 ? "border-r-0" : ""
                        }`}
                      >
                        {entry.time}
                        <br />
                        <span className="text-[8px] font-normal text-slate-500">
                          {entry.id === 3 ? "Recess" : entry.id === 6 ? "Slot 7 Eve" : `Slot ${entry.id === 4 ? 5 : entry.id === 5 ? 6 : entry.id + 1}`}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {summary.rows.map(({ item, slots: cells }) => (
                    <tr key={item.building.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="border-r border-slate-200 bg-slate-50/80 p-2 text-left">
                        <div className="truncate text-[9px] font-bold uppercase tracking-wider text-blue-600">
                          {item.campusName.split("(")[0]}
                        </div>
                        <div className="truncate text-[11px] font-black text-slate-900">{item.building.name}</div>
                        <div className="text-[8.5px] font-medium text-slate-500">
                          {item.building.totalRooms} Rooms • {item.building.totalSeats.toLocaleString()} Seats
                        </div>
                      </td>
                      {cells.map((agg, index) => {
                        const entry = slots[index];
                        return (
                          <td key={entry.id} className="border-r border-slate-200 p-0.5 last:border-r-0 sm:p-1">
                            <button
                              type="button"
                              onClick={() => inspect(item.building.id, entry.id)}
                              onMouseEnter={(event) =>
                                setTip({
                                  x: event.clientX,
                                  y: event.clientY,
                                  title: `${item.building.name} (${entry.time})`,
                                  body: agg.isBlackout ? (
                                    <>
                                      <div className="text-xs font-bold text-purple-300">★ FACULTY SENATE BLACKOUT</div>
                                      <div className="text-slate-400">Locked for institutional assembly.</div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex justify-between gap-4">
                                        <span>Occupancy:</span>
                                        <strong className="text-blue-400">{agg.percent}%</strong>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span>Active Seats:</span>
                                        <strong>
                                          {agg.count.toLocaleString()} / {item.building.totalSeats.toLocaleString()}
                                        </strong>
                                      </div>
                                      <div className="border-t border-slate-800 pt-1 text-[9.5px] text-slate-400">
                                        Click to inspect spatial grid.
                                      </div>
                                    </>
                                  ),
                                })
                              }
                              onMouseLeave={() => setTip(null)}
                              className={`heat-cell flex min-h-[44px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border p-1 text-center ${heatClass(
                                agg.percent,
                                agg.isBlackout
                              )}`}
                            >
                              {agg.isBlackout ? (
                                <>
                                  <Lock className="mb-0.5 h-3 w-3 text-purple-900" />
                                  <span className="text-[8px] font-extrabold uppercase text-purple-900">Locked</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[11px] font-black tracking-tight">{agg.percent}%</span>
                                  <span className="hidden truncate text-[8px] font-semibold opacity-90 xl:inline-block">
                                    {agg.count.toLocaleString()} / {item.building.totalSeats.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {summary.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-[11px] text-slate-500">
                        No buildings in scope — widen the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* MICRO SPATIAL GRID */
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col items-start justify-between gap-2 border-b border-slate-100 pb-2.5 sm:flex-row sm:items-center">
              <div>
                <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                  {target ? `${target.campusName} • ${target.building.code}` : "Building Drill-Down View"}
                </span>
                <h2 className="mt-0.5 text-sm font-black text-slate-900">
                  {target
                    ? `${target.building.name} — Spatial Room Cards (${target.building.totalRooms} Rooms)`
                    : "Spatial Room-by-Room Occupancy Cards"}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFloor("all")}
                  className={`rounded-lg px-2.5 py-1 transition-all ${
                    floor === "all" ? "bg-blue-600 font-bold text-white shadow-xs" : "font-semibold text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All Floors
                </button>
                {target?.building.floors.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setFloor(entry.id)}
                    className={`rounded-lg px-2.5 py-1 transition-all ${
                      floor === entry.id
                        ? "bg-blue-600 font-bold text-white shadow-xs"
                        : "font-semibold text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {entry.name}
                  </button>
                ))}
                <div className="mx-1 h-4 w-px bg-slate-200" />
                <span className="pr-1 text-[10px] font-bold uppercase text-slate-400">Zone:</span>
                {(["all", "A", "B"] as Wing[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWing(value)}
                    className={`rounded-md px-2 py-0.5 text-[10px] ${
                      wing === value ? "bg-slate-800 font-bold text-white" : "bg-slate-200 font-semibold text-slate-700"
                    }`}
                  >
                    {value === "all" ? "All Wings" : value === "A" ? "Wing A (1–4)" : "Wing B (5+)"}
                  </button>
                ))}
              </div>
            </div>

            {target?.building.floors.map((entry) => {
              if (floor !== "all" && floor !== entry.id) return null;
              return (
                <div key={entry.id} className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                      <h4 className="text-xs font-extrabold text-slate-900">
                        {entry.name} — {entry.label}
                      </h4>
                    </div>
                    <span className="text-[10.5px] font-medium text-slate-600">
                      Window: <strong className="font-bold text-blue-700">{activeSlot.time}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
                    {Array.from({ length: entry.count }).map((_, index) => {
                      if (wing === "A" && index >= 4) return null;
                      if (wing === "B" && index < 4) return null;
                      const name = live
                        ? live.roomName(target.building.id, entry.id, index)
                        : roomName(entry, index);
                      const room = resolve(
                        target.building.id,
                        week,
                        day,
                        activeSlotId,
                        entry.id,
                        index,
                        entry.capPerRoom,
                        entry.isHall
                      );
                      return (
                        <button
                          key={`${entry.id}-${index}`}
                          type="button"
                          onMouseEnter={(event) =>
                            setTip({
                              x: event.clientX,
                              y: event.clientY,
                              title: `${target.building.code} ${name}`,
                              body: room.isBlackout ? (
                                <>
                                  <div className="font-bold text-purple-300">★ FACULTY BLACKOUT BLOCK</div>
                                  <div>No student sections permitted.</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-xs font-bold text-white">{room.course}</div>
                                  <div className="text-[10.5px] text-slate-300">Instructor: {room.prof}</div>
                                  <div className="flex justify-between gap-4 pt-1 text-[10.5px]">
                                    <span>Occupancy:</span>
                                    <strong className="text-emerald-400">
                                      {room.percent}% ({room.count}/{entry.capPerRoom})
                                    </strong>
                                  </div>
                                </>
                              ),
                            })
                          }
                          onMouseLeave={() => setTip(null)}
                          className={`heat-cell flex min-h-[64px] cursor-pointer flex-col justify-between rounded-xl border p-2 text-center ${heatClass(
                            room.percent,
                            room.isBlackout
                          )}`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-900/10 pb-0.5 text-[8.5px] font-bold opacity-90">
                            <span className="truncate">{name}</span>
                            <span>
                              {room.count}/{entry.capPerRoom}
                            </span>
                          </div>
                          <div className="my-0.5">
                            {room.isBlackout ? (
                              <span className="block text-[9px] font-bold text-purple-950">LOCKED</span>
                            ) : (
                              <span className="text-sm font-black tracking-tight">{room.percent}%</span>
                            )}
                          </div>
                          <div className="truncate text-[8px] font-semibold text-slate-800" title={room.course}>
                            {room.isBlackout ? "Senate Block" : room.course}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Collapsible analytics */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold leading-tight text-slate-900">
                  Live Campus Analytics &amp; Load Profiles
                </h3>
                <p className="text-[10px] font-medium text-slate-500">
                  {live ? "Occupancy from the current placed term" : "Sample occupancy curves (design preview)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {analyticsOpen && (
                <span className="hidden items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 sm:inline-flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {live ? "Live Telemetry Active" : "Sample telemetry"}
                </span>
              )}
              <button
                type="button"
                onClick={() => setAnalyticsOpen((value) => !value)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200/80 active:scale-95"
              >
                <span>{analyticsOpen ? "Hide Analytics" : "Show Analytics"}</span>
                <ChevronUp
                  className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-300 ${
                    analyticsOpen ? "" : "rotate-180"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className={`analytics-collapsible ${analyticsOpen ? "" : "collapsed"}`}>
            <div className="analytics-inner pt-1">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 xl:col-span-7">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                    <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <LineChart className="h-3.5 w-3.5 text-blue-600" />
                      <span>Campus Time-of-Day Traffic &amp; Student Load Curve</span>
                    </h4>
                    <span className="shrink-0 text-[10px] font-bold text-slate-500">
                      {live ? "Live day profile" : "Peak: 10:00–11:30"}
                    </span>
                  </div>
                  <EChart option={trafficOption} className="h-44 w-full" label="Campus traffic by time of day" />
                </div>

                <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 xl:col-span-5">
                  <div className="space-y-1">
                    <h4 className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2 text-xs font-extrabold text-slate-800">
                      <BarChart2 className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Multi-Quad Building Utilization</span>
                    </h4>
                    <p className="text-[10px] font-medium text-slate-500">
                      {live ? "Average seat occupancy per building." : "Average seat occupancy across 4 Quad Sites."}
                    </p>
                  </div>
                  <EChart option={quadOption} className="h-36 w-full" label="Utilization by campus quad" />
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-[10px] text-slate-700 shadow-xs">
                    <span className="font-semibold">Highest Occupancy Site:</span>
                    <span className="truncate font-bold text-blue-700">
                      {live
                        ? `${summary.busiestName} (${summary.busiestPercent}%)`
                        : "Business & Governance (84.2%)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      {/* FILTER DRAWER (inside the preview window) */}
      {drawerOpen && (
        <div className="absolute inset-0 z-40">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40 backdrop-blur-xs"
          />
          <div className="drawer-panel absolute right-0 top-0 flex h-full w-full max-w-sm flex-col justify-between border-l border-slate-200 bg-white p-5 shadow-2xl">
            <div className="custom-scrollbar space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-blue-600" />
                  <h2 className="text-base font-extrabold text-slate-900">Filters &amp; Scope Control</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close"
                  className="rounded-xl bg-slate-100 p-1.5 text-slate-600 transition-all hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label htmlFor="matrix-campus" className="mb-1 block font-bold text-slate-700">
                    Select Campus Quad Site:
                  </label>
                  <select
                    id="matrix-campus"
                    value={campus}
                    onChange={(event) => changeCampus(event.target.value)}
                    className={FIELD}
                  >
                    <option value="all">All University Quads (Enterprise Overview)</option>
                    {order.map((id) => (
                      <option key={id} value={id}>
                        {model[id]?.name ?? id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="matrix-building" className="mb-1 block font-bold text-slate-700">
                    Select Academic Building:
                  </label>
                  <select
                    id="matrix-building"
                    value={building}
                    onChange={(event) => {
                      setBuilding(event.target.value);
                      setFloor("all");
                      setWing("all");
                    }}
                    className={FIELD}
                  >
                    <option value="all">All Buildings in Scope</option>
                    {activeBuildings(campus, "all", model, order).map((entry) => (
                      <option key={entry.building.id} value={entry.building.id}>
                        {entry.building.name} ({entry.building.totalRooms} Rooms)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="matrix-week" className="mb-1 block font-bold text-slate-700">
                    Academic Term Week:
                  </label>
                  <select
                    id="matrix-week"
                    value={week}
                    onChange={(event) => setWeek(event.target.value)}
                    className={FIELD}
                    disabled={Boolean(live)}
                  >
                    {live ? (
                      <option value={week}>Live placed term</option>
                    ) : (
                      WEEK_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="matrix-day" className="mb-1 block font-bold text-slate-700">
                    Operating Day:
                  </label>
                  <select
                    id="matrix-day"
                    value={day}
                    onChange={(event) => setDay(event.target.value as Day)}
                    className={FIELD}
                  >
                    {DAY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="matrix-slot" className="mb-1 block font-bold text-slate-700">
                    Time Slot Window Focus:
                  </label>
                  <select
                    id="matrix-slot"
                    value={String(slot)}
                    onChange={(event) => setSlot(event.target.value === "all" ? "all" : Number(event.target.value))}
                    className={FIELD}
                  >
                    <option value="all">All Time Slots (Daily Matrix View)</option>
                    {slots.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.time} ({entry.label})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                  Institutional Scope Summary
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700">
                  {live ? (
                    <>
                      <div>• {live.stats.buildings} Buildings</div>
                      <div>• {live.stats.rooms} Physical Rooms</div>
                      <div>• {live.stats.seats.toLocaleString()} Seats</div>
                      <div>• {live.term}</div>
                    </>
                  ) : (
                    <>
                      <div>• 4 Campus Quads</div>
                      <div>• 12 Academic Bldgs</div>
                      <div>• 311 Physical Rooms</div>
                      <div>• 15,370 Peak Seats</div>
                    </>
                  )}
                </div>
                <div className="border-t border-slate-200 pt-2 text-[10.5px] font-medium text-slate-500">
                  {live
                    ? "Every cell is read from the placed timetable: room, day and period."
                    : "Enforcing 1.5h slots (80m + 10m travel buffer) & intermittent 14:00 faculty blackouts."}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT HELP MODAL */}
      {helpOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close context help"
            onClick={() => setHelpOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40 backdrop-blur-xs"
          />
          <div className="animate-pop relative max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-blue-600">
                <Info className="h-4 w-4" />
                <span>Understanding &quot;Current Context&quot;</span>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close"
                className="rounded-lg bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="font-normal leading-relaxed text-slate-600">
              <strong>Current Context</strong> reflects your active filtering state across all institutional
              parameters:
            </p>
            <ul className="space-y-1.5 border-l-2 border-blue-500 pl-2 font-medium text-slate-700">
              <li>• <strong>Quad Site:</strong> Active campus zone filter (e.g., Main Academic Campus)</li>
              <li>• <strong>Building:</strong> Selected facility (e.g., Soda Hall) or full campus view</li>
              <li>• <strong>Academic Week:</strong> 15-Week Term Engine schedule anchor (e.g., Week 3)</li>
              <li>• <strong>Operating Slot:</strong> Operating Day and selected 1.5h time window</li>
            </ul>
            <p className="border-t border-slate-100 pt-1 text-[11px] text-slate-500">
              To alter the Current Context, open the <strong>Filters Drawer</strong> at the top right.
            </p>
          </div>
        </div>
      )}

      {/* FLOATING TOOLTIP (portalled: the animated canvas creates a containing
          block, so fixed positioning must live outside it) */}
      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[90] mb-2 max-w-xs -translate-x-1/2 -translate-y-full space-y-1 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur-md"
            style={{ left: tip.x, top: tip.y }}
            role="tooltip"
          >
            <div className="border-b border-slate-800 pb-1 text-xs font-bold text-blue-400">{tip.title}</div>
            <div className="space-y-1 text-slate-300">{tip.body}</div>
          </div>,
          document.body
        )}
    </div>
  );
}
