"use client";

// Interactive campus timetable demo for the marketing landing page.
//
// Faithful port of the `#demo-app` section in local-design/landing-page.html:
// role switcher, scope pills, filter drawer, macro heatmap table, spatial room
// cards, hover tooltips and auto-scrub playback. The campus model is shared
// with the signed-in preview (components/landing/campus-data.ts).

import { useEffect, useMemo, useState } from "react";
import {
  Lock,
  Palette,
  Pause,
  Play,
  Sliders,
  X,
} from "lucide-react";
import {
  CAMPUSES,
  SLOTS,
  activeBuildings,
  buildingSlot,
  generateRoomData,
  roomName,
  type Day,
  type Week,
} from "@/components/landing/campus-data";
import {
  DAY_OPTIONS,
  SLOT_OPTIONS,
  WEEK_OPTIONS,
  heatColor,
} from "./data";

type ViewMode = "macro" | "micro";
type Role = "registrar" | "faculty" | "student";

const ROLES: { key: Role; label: string }[] = [
  { key: "registrar", label: "Registrar / Admin" },
  { key: "faculty", label: "Faculty Professor" },
  { key: "student", label: "Student Cohort" },
];

// The role switcher changes the lens on the same campus model: the registrar
// sees the whole institution, a professor sees their load/preferences and the
// buildings they teach in, and a cohort sees its degree path and working fit.
// Illustrative demo data, consistent with the rest of this landing page.
const ROLE_LENS: Record<
  Role,
  {
    badge: string;
    title: string;
    description: string;
    metrics: [string, string][];
    focusBuildings: string[];
    focusSlots: number[];
    accent: string;
  }
> = {
  registrar: {
    badge: "Registrar / Admin lens",
    title: "Institution-wide occupancy",
    description:
      "Every quad, building and slot in one board — the view the registrar publishes.",
    metrics: [
      ["Buildings", "12"],
      ["Rooms", "311"],
      ["Peak seats", "15,370"],
      ["Cohorts", "100"],
    ],
    focusBuildings: [],
    focusSlots: [],
    accent: "border-navy-900/15 bg-slate-50",
  },
  faculty: {
    badge: "Faculty Professor lens",
    title: "Prof. Chen — teaching load & preferences",
    description:
      "Two sections, two preps, and the Wed 14:00 senate blackout honored by the solver.",
    metrics: [
      ["Sections", "2 / 2"],
      ["Preps", "2 / 2"],
      ["Load", "Within cap"],
      ["Preference match", "100%"],
    ],
    focusBuildings: ["main-soda"],
    focusSlots: [1, 4],
    accent: "border-violet-300 bg-violet-50/60",
  },
  student: {
    badge: "Student Cohort lens",
    title: "CS 2025 cohort — degree path & working fit",
    description:
      "Mandatory courses, the projected graduation term and the Tue/Thu work block in one view.",
    metrics: [
      ["Mandatory done", "1 / 7"],
      ["Projected grad", "Spring 2029"],
      ["Work days", "Tue/Thu"],
      ["Conflicts", "0"],
    ],
    focusBuildings: ["main-soda", "main-evans"],
    focusSlots: [0, 2],
    accent: "border-teal-brand-300 bg-teal-brand-50/60",
  },
};

const SELECT =
  "w-full bg-slate-50 border border-editorial-border rounded-xl px-3.5 py-2.5 font-bold text-navy-900 focus:ring-2 focus:ring-teal-brand-500 shadow-xs focus:outline-none";

const SLOT_WIDTHS = ["w-[11%]", "w-[11%]", "w-[11%]", "w-[10%]", "w-[11%]", "w-[11%]", "w-[11%]"];

function slotCaption(id: number): string {
  if (id === 3) return "Recess";
  if (id === 6) return "Slot 7 Eve";
  return `Slot ${id + 1}`;
}

const TOOLTIP_BODY = "space-y-1 text-slate-300 text-[11px] font-medium";

interface Tip {
  x: number;
  y: number;
  title: string;
  body: React.ReactNode;
}

export function MatrixDemo({
  slot,
  onSlotChange,
  onToast,
}: {
  slot: number;
  onSlotChange: (slotId: number) => void;
  onToast: (message: string) => void;
}) {
  const [campus, setCampus] = useState("all");
  const [building, setBuilding] = useState("all");
  const [week, setWeek] = useState<Week>("3");
  const [day, setDay] = useState<Day>("wed");
  const [view, setView] = useState<ViewMode>("macro");
  const [floor, setFloor] = useState("all");
  const [role, setRole] = useState<Role>("registrar");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);

  const list = useMemo(() => activeBuildings(campus, building), [campus, building]);
  const campusBuildings = useMemo(() => activeBuildings(campus, "all"), [campus]);
  const activeSlot = SLOTS[slot] ?? SLOTS[1];

  // Auto-scrub cycles the shared slot selection every 1.8s (design behaviour).
  useEffect(() => {
    if (!playing) return;
    let index = 0;
    const timer = window.setInterval(() => {
      onSlotChange(index);
      index = (index + 1) % SLOTS.length;
    }, 1800);
    return () => window.clearInterval(timer);
  }, [playing, onSlotChange]);

  // Keep the floating tooltip glued to the cursor while it is visible.
  useEffect(() => {
    if (!tip) return;
    function move(event: MouseEvent) {
      setTip((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : null));
    }
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [tip]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function changeCampus(next: string) {
    setCampus(next);
    setBuilding("all");
    setFloor("all");
  }

  function inspect(buildingId: string, slotId: number) {
    setBuilding(buildingId);
    onSlotChange(slotId);
    setView("micro");
  }

  function selectRole(next: Role) {
    setRole(next);
    // Reset scope so the lens' focus buildings are always visible.
    setCampus("all");
    setBuilding("all");
    setFloor("all");
    onToast(`Switched view scope to ${next.toUpperCase()} profile.`);
  }

  const target =
    building === "all" ? list[0] : list.find((item) => item.building.id === building) ?? list[0];
  const lens = ROLE_LENS[role];

  const pillCampus =
    campus === "all" ? "All Quads" : CAMPUSES[campus]?.name ?? "All Quads";
  const pillBuilding =
    building === "all"
      ? "All Buildings"
      : campusBuildings.find((item) => item.building.id === building)?.building.code ??
        "All Buildings";

  return (
    <section id="demo-app" className="mx-auto max-w-[1800px] space-y-6 px-4 sm:px-8">
      {/* Section header + role switcher */}
      <div className="relative border-b border-editorial-border pb-6">
        <div className="watermark-bg -top-4 right-0 text-[8vw] font-black opacity-[0.03]">
          MASTER MATRIX
        </div>
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-navy-900 sm:text-4xl">
              Live Timetable Matrix &amp; Spatial Heatmap
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Interactive demo campus — switch views to inspect real-time room occupancy.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-2xl border border-editorial-border bg-white p-1.5 shadow-xs">
            {ROLES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => selectRole(item.key)}
                className={
                  role === item.key
                    ? "rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all"
                    : "rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-600 transition-all hover:text-navy-900"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Role lens: the same campus model, framed for the selected role */}
      <div className={`rounded-2xl border p-4 shadow-xs ${lens.accent}`}>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-sm font-black text-navy-900">{lens.title}</h3>
            <p className="mt-1 max-w-2xl text-xs font-medium text-slate-600">
              {lens.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {lens.metrics.map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-center shadow-xs"
              >
                <div className="text-sm font-black text-navy-900">{value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-editorial-border bg-white p-3.5 text-xs shadow-xs lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-bold text-slate-700">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Active Scope:</span>
          <span className="rounded-xl border border-editorial-border bg-slate-100 px-3 py-1 text-navy-900">
            {pillCampus}
          </span>
          <span className="text-slate-300">›</span>
          <span className="rounded-xl border border-teal-brand-200 bg-teal-brand-50 px-3 py-1 text-teal-brand-900">
            {pillBuilding}
          </span>
          <span className="text-slate-300">›</span>
          <span className="rounded-xl border border-editorial-border bg-slate-100 px-3 py-1 text-slate-800">
            Week {week}
          </span>
          <span className="text-slate-300">›</span>
          <span className="rounded-xl border border-teal-brand-300 bg-teal-brand-100 px-3 py-1 text-teal-brand-950">
            {day.toUpperCase()}, {activeSlot.time.split("–")[0].trim()}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-editorial-border bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-navy-900 transition-all hover:bg-slate-100 active:scale-95"
          >
            <Sliders className="h-3.5 w-3.5 text-teal-brand-600" />
            <span>Filters Drawer</span>
            <span className="rounded-md bg-teal-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              3 Active
            </span>
          </button>

          <div className="my-auto h-4 w-px bg-editorial-border" />

          <div className="flex items-center gap-1 rounded-xl border border-editorial-border bg-slate-100 p-1">
            {(["macro", "micro"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={
                  view === mode
                    ? "rounded-lg bg-white px-3 py-1 text-xs font-bold text-teal-brand-900 shadow-xs transition-all"
                    : "rounded-lg px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:text-navy-900"
                }
              >
                {mode === "macro" ? "Macro Matrix" : "Spatial Grid"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="flex items-center gap-1.5 rounded-xl bg-teal-brand-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-teal-brand-700 active:scale-95"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{playing ? "Pause" : "Auto-Scrub"}</span>
          </button>
        </div>
      </div>

      {/* Heatmap legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-editorial-border bg-white px-4 py-2.5 text-xs shadow-xs">
        <div className="flex items-center gap-2 font-bold text-navy-900">
          <Palette className="h-4 w-4 text-teal-brand-600" />
          <span>Heatmap Capacity Scale:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] font-bold">
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-emerald-950">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
            <span>Vacant (&lt;40%)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-0.5 text-cyan-950">
            <span className="h-2.5 w-2.5 rounded-xs bg-cyan-500" />
            <span>Moderate (40–75%)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-teal-950">
            <span className="h-2.5 w-2.5 rounded-xs bg-teal-500" />
            <span>High (75–90%)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-rose-950">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-600" />
            <span>Peak (&gt;90%)</span>
          </div>
          <div className="pattern-blackout flex items-center gap-1.5 rounded-md border border-teal-brand-300 bg-teal-brand-50 px-2.5 py-0.5 text-teal-brand-950">
            <span className="h-2.5 w-2.5 rounded-xs bg-teal-brand-600" />
            <span className="font-bold">Faculty Blackout Block</span>
          </div>
        </div>
      </div>

      {/* Macro matrix */}
      {view === "macro" && (
        <div className="space-y-4 rounded-2xl border border-editorial-border bg-white p-5 shadow-xs">
          <div className="flex items-center justify-end border-b border-editorial-border pb-3">
            <div className="text-[11px] font-semibold text-slate-500">
              Click any slot cell to inspect room cards in spatial grid
            </div>
          </div>

          <div className="custom-scrollbar w-full overflow-x-auto">
            <table className="w-full min-w-[880px] table-fixed border-collapse text-center text-xs">
              <thead>
                <tr className="border-b border-editorial-border bg-slate-50 text-[10.5px] font-bold text-navy-900">
                  <th className="w-[24%] border-r border-editorial-border bg-slate-50 p-2.5 text-left">
                    Quad &amp; Academic Facility
                  </th>
                  {SLOTS.map((entry, index) => (
                    <th
                      key={entry.id}
                      className={`${SLOT_WIDTHS[index]} ${index === SLOTS.length - 1 ? "" : "border-r border-editorial-border"} p-1 ${
                        lens.focusSlots.includes(entry.id) ? "bg-teal-brand-100/80" : ""
                      }`}
                    >
                      {entry.time}
                      <br />
                      <span className="text-[8.5px] font-normal text-slate-500">
                        {slotCaption(entry.id)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border">
                {list.map((item) => {
                  const b = item.building;
                  const focused = lens.focusBuildings.includes(b.id);
                  return (
                    <tr
                      key={b.id}
                      className={`transition-colors hover:bg-teal-brand-50/40 ${
                        focused ? "bg-teal-brand-50/50" : ""
                      }`}
                    >
                      <td className="border-r border-editorial-border bg-slate-50 p-2.5 text-left font-bold text-navy-900">
                        <div className="truncate text-[9px] font-extrabold uppercase tracking-wider text-teal-brand-700">
                          {item.campusName.split("(")[0]}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-black text-navy-900">{b.name}</span>
                          {focused && (
                            <span className="shrink-0 rounded bg-teal-brand-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">
                              {role === "faculty" ? "Teaching" : "Cohort"}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          {b.totalRooms} Rooms • {b.totalSeats.toLocaleString()} Seats
                        </div>
                      </td>
                      {SLOTS.map((entry) => {
                        const cell = buildingSlot(b, week, day, entry.id);
                        return (
                          <td key={entry.id} className="border-r border-editorial-border p-1">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => inspect(b.id, entry.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  inspect(b.id, entry.id);
                                }
                              }}
                              onMouseEnter={(event) =>
                                setTip({
                                  x: event.clientX,
                                  y: event.clientY,
                                  title: b.name,
                                  body: cell.isBlackout ? (
                                    <>
                                      <div className="font-bold text-cyan-brand-400">
                                        ★ FACULTY SENATE BLACKOUT
                                      </div>
                                      <div className="text-slate-400">
                                        Locked for institutional assembly.
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex justify-between">
                                        <span>Occupancy:</span>{" "}
                                        <strong className="text-cyan-brand-400">{cell.percent}%</strong>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Active Seats:</span>{" "}
                                        <strong>
                                          {cell.count.toLocaleString()} /{" "}
                                          {b.totalSeats.toLocaleString()}
                                        </strong>
                                      </div>
                                      <div className="border-t border-navy-800 pt-1 text-[9.5px] text-slate-400">
                                        Click cell to inspect spatial room grid.
                                      </div>
                                    </>
                                  ),
                                })
                              }
                              onMouseLeave={() => setTip(null)}
                              className={`heat-cell flex min-h-[46px] cursor-pointer flex-col items-center justify-center rounded-xl border p-1.5 ${heatColor(cell.percent, cell.isBlackout)}`}
                            >
                              {cell.isBlackout ? (
                                <>
                                  <Lock className="mb-0.5 h-3 w-3 text-teal-brand-900" />
                                  <span className="text-[8px] font-black uppercase text-teal-brand-950">
                                    LOCKED
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-black tracking-tight">
                                    {cell.percent}%
                                  </span>
                                  <span className="truncate text-[8px] font-semibold opacity-90">
                                    {cell.count}/{b.totalSeats}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spatial grid */}
      {view === "micro" && target && (
        <div className="space-y-4 rounded-2xl border border-editorial-border bg-white p-5 shadow-xs">
          <div className="flex flex-col items-start justify-between gap-2 border-b border-editorial-border pb-3 sm:flex-row sm:items-center">
            <div>
              <span className="rounded border border-teal-brand-200 bg-teal-brand-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-brand-900">
                {target.campusName} • {target.building.code}
              </span>
              <h3 className="mt-1 text-base font-black text-navy-900">
                {target.building.name} — Spatial Room Cards ({target.building.totalRooms} Rooms)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-editorial-border bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setFloor("all")}
                className={
                  floor === "all"
                    ? "rounded-lg bg-teal-brand-600 px-3 py-1 font-bold text-white shadow-xs transition-all"
                    : "rounded-lg px-3 py-1 font-semibold text-slate-600 transition-all hover:text-navy-900"
                }
              >
                All Floors
              </button>
              {target.building.floors.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setFloor(entry.id)}
                  className={
                    floor === entry.id
                      ? "rounded-lg bg-teal-brand-600 px-3 py-1 font-bold text-white shadow-xs transition-all"
                      : "rounded-lg px-3 py-1 font-semibold text-slate-600 transition-all hover:text-navy-900"
                  }
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {target.building.floors
              .filter((entry) => floor === "all" || floor === entry.id)
              .map((entry) => (
                <div
                  key={entry.id}
                  className="space-y-3 rounded-2xl border border-editorial-border bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-editorial-border pb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-teal-brand-600" />
                      <h4 className="text-xs font-extrabold text-navy-900">
                        {entry.name} — {entry.label}
                      </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Window:{" "}
                      <strong className="font-bold text-teal-brand-700">{activeSlot.time}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {Array.from({ length: entry.count }, (_, index) => {
                      const name = roomName(entry, index);
                      const room = generateRoomData(
                        target.building.id,
                        week,
                        day,
                        slot,
                        entry.id,
                        index,
                        entry.capPerRoom,
                        entry.isHall
                      );
                      return (
                        <div
                          key={index}
                          onMouseEnter={(event) =>
                            setTip({
                              x: event.clientX,
                              y: event.clientY,
                              title: `${target.building.code} ${name}`,
                              body: room.isBlackout ? (
                                <>
                                  <div className="font-bold text-cyan-brand-400">
                                    ★ FACULTY BLACKOUT BLOCK
                                  </div>
                                  <div>No sections permitted.</div>
                                </>
                              ) : (
                                <>
                                  <div className="font-bold text-white">{room.course}</div>
                                  <div className="text-[10.5px] text-slate-300">
                                    Instructor: {room.prof}
                                  </div>
                                  <div className="flex justify-between pt-1">
                                    <span>Occupancy:</span>{" "}
                                    <strong className="text-emerald-400">
                                      {room.percent}% ({room.count}/{entry.capPerRoom})
                                    </strong>
                                  </div>
                                </>
                              ),
                            })
                          }
                          onMouseLeave={() => setTip(null)}
                          className={`heat-cell flex min-h-[72px] cursor-pointer flex-col justify-between rounded-xl border p-2.5 text-center ${heatColor(room.percent, room.isBlackout)}`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-900/10 pb-0.5 text-[9.5px] font-bold opacity-90">
                            <span>{name}</span>
                            <span>
                              {room.count}/{entry.capPerRoom}
                            </span>
                          </div>

                          <div className="my-1">
                            {room.isBlackout ? (
                              <span className="block text-[9px] font-black text-teal-brand-950">
                                LOCKED
                              </span>
                            ) : (
                              <span className="text-sm font-black tracking-tight">
                                {room.percent}%
                              </span>
                            )}
                          </div>

                          <div
                            className="truncate text-[8.5px] font-bold text-slate-800"
                            title={room.course}
                          >
                            {room.isBlackout ? "Senate Block" : room.course}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filter drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-navy-950/40 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-label="Scope and policy control"
            className="drawer-panel relative flex h-full w-full max-w-md flex-col justify-between border-l border-editorial-border bg-white p-6 shadow-2xl"
          >
            <div className="custom-scrollbar space-y-6 overflow-y-auto pr-1">
              <div className="flex items-center justify-between border-b border-editorial-border pb-4">
                <div className="flex items-center gap-2.5">
                  <Sliders className="h-5 w-5 text-teal-brand-600" />
                  <h2 className="text-base font-black tracking-tight text-navy-900">
                    Scope &amp; Policy Control
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-xl bg-slate-100 p-2 text-slate-600 transition-all hover:bg-slate-200"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                    Campus Quad Site:
                  </label>
                  <select
                    value={campus}
                    onChange={(event) => changeCampus(event.target.value)}
                    className={SELECT}
                  >
                    <option value="all">All University Quads (Global Scope)</option>
                    <option value="main">Main Academic Campus (Core)</option>
                    <option value="eng">Engineering &amp; Applied Tech Quad</option>
                    <option value="biz">Business &amp; Governance Quad</option>
                    <option value="life">Health Sciences &amp; Life Quad</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                    Academic Building:
                  </label>
                  <select
                    value={building}
                    onChange={(event) => {
                      setBuilding(event.target.value);
                      setFloor("all");
                    }}
                    className={SELECT}
                  >
                    <option value="all">All Buildings in Scope</option>
                    {campusBuildings.map((item) => (
                      <option key={item.building.id} value={item.building.id}>
                        {item.building.name} ({item.building.totalRooms} Rooms)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                    Academic Term Week:
                  </label>
                  <select
                    value={week}
                    onChange={(event) => setWeek(event.target.value as Week)}
                    className={SELECT}
                  >
                    {WEEK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                    Operating Day:
                  </label>
                  <select
                    value={day}
                    onChange={(event) => setDay(event.target.value as Day)}
                    className={SELECT}
                  >
                    {DAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-800">
                    Time Slot Focus:
                  </label>
                  <select
                    value={String(slot)}
                    onChange={(event) => {
                      const next = event.target.value;
                      onSlotChange(next === "all" ? 1 : Number(next));
                    }}
                    className={SELECT}
                  >
                    {SLOT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 rounded-2xl border border-teal-brand-200 bg-teal-brand-50/60 p-4 text-xs shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-teal-brand-900">
                  <span>Institutional Scope</span>
                  <span className="rounded border border-teal-brand-300 bg-teal-brand-100 px-2 py-0.5 font-bold text-teal-brand-900">
                    100% Verified
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-navy-900">
                  <div>• 4 Campus Quads</div>
                  <div>• 12 Academic Bldgs</div>
                  <div>• 311 Physical Rooms</div>
                  <div>• 15,370 Peak Seats</div>
                </div>
                <div className="border-t border-teal-brand-200 pt-2 text-[10.5px] font-medium leading-relaxed text-slate-600">
                  Enforcing 1.5h slots (80m + 10m buffer) &amp; intermittent 14:00 faculty
                  blackouts.
                </div>
              </div>
            </div>

            <div className="border-t border-editorial-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onToast("Scope parameters applied — matrix refreshed.");
                }}
                className="w-full rounded-xl bg-teal-brand-600 py-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-teal-brand-700"
              >
                Apply Parameters &amp; Refresh Matrix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating hover tooltip */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-xl border border-teal-brand-600/40 bg-navy-900 p-3.5 text-xs text-slate-100 shadow-2xl backdrop-blur-md"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          <div className="flex items-center justify-between border-b border-navy-800 pb-1 text-xs font-extrabold text-cyan-brand-400">
            <span>{tip.title}</span>
            <span className="rounded border border-teal-brand-500/30 bg-teal-brand-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-brand-200">
              Proof Verified
            </span>
          </div>
          <div className={TOOLTIP_BODY}>{tip.body}</div>
        </div>
      )}
    </section>
  );
}
