"use client";

// "Interactive Analytics" workspace modal: live-ish telemetry, constraint
// tuning controls, a simulated dual-kernel benchmark, and the master schedule
// matrix with CSV export. Preview-only; the real workspace lives behind login.

import { useEffect, useRef, useState } from "react";
import {
  BarChart2,
  Cpu,
  Download,
  LayoutGrid,
  Loader2,
  Moon,
  Play,
  Sliders,
  X,
} from "lucide-react";
import { EChart } from "@/components/ui/echart";
import { modalCapacityOption, modalSpeedOption } from "./charts";
import { MASTER_ROWS, SOLVER_LOGS, type Persona } from "./data";
import { downloadMasterCsv } from "./download";

const ROLE_TITLE: Record<Persona, string> = {
  coordinator: "Coordinator Master Dashboard",
  instructor: "Instructor Dashboard — Prof. H. Chen",
  student: "Student Track Portal — CS Senior",
};

export function AnalyticsModal({
  persona,
  email,
  onClose,
  onToast,
}: {
  persona: Persona;
  email: string;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [transit, setTransit] = useState(15);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState(SOLVER_LOGS[0]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, [onClose]);

  const rows = MASTER_ROWS.filter((row) =>
    `${row.code} ${row.name} ${row.instructor} ${row.slot}`.toLowerCase().includes(search.toLowerCase())
  );

  function runSolver() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setRunning(true);
    setProgress(0);
    setLog(SOLVER_LOGS[0]);

    SOLVER_LOGS.forEach((line, index) => {
      timers.current.push(
        window.setTimeout(() => {
          setProgress(Math.min((index + 1) * 20, 100));
          setLog(line);
        }, (index + 1) * 350)
      );
    });

    timers.current.push(
      window.setTimeout(() => {
        setRunning(false);
        onToast("Illustrative preview only — run the real solve after sign-in");
      }, 5 * 350 + 1200)
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Interactive analytics workspace"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-5xl space-y-6 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">{ROLE_TITLE[persona]}</h3>
              <p className="text-xs font-medium text-slate-500">
                Illustrative preview —{" "}
                <span className="font-bold text-slate-700">sign in for the live solver and model</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close analytics"
            className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-medium sm:grid-cols-5">
          <div>
            <div className="text-slate-500">Sample Engine Status</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Hard constraints enforced
            </div>
          </div>
          <div>
            <div className="text-slate-500">Sample Sections</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">101 / 101</div>
          </div>
          <div>
            <div className="text-slate-500">Sample Faculty</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-emerald-600">68 / 68 within cap</div>
          </div>
          <div>
            <div className="text-slate-500">Preference match</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-purple-600">shown after solve</div>
          </div>
          <div>
            <div className="text-slate-500">Peak building utilization</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-blue-600">shown after solve</div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-900">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              <span>Illustrative engine &amp; distribution analytics</span>
            </span>
            <span className="hidden font-mono text-[11px] text-blue-700 sm:inline">
              sample data — live after sign-in
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <EChart option={modalCapacityOption} className="h-44 w-full" label="Zone capacity breakdown" />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <EChart option={modalSpeedOption} className="h-44 w-full" label="Parallel kernel race speed" />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-blue-900">
            <span className="flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-blue-600" />
              <span>Illustrative constraint tuning controls</span>
            </span>
            <span className="hidden font-mono text-[11px] text-blue-700 sm:inline">
              preview only — not connected
            </span>
          </div>

          <div className="grid grid-cols-1 items-center gap-4 text-xs sm:grid-cols-3">
            <div>
              <label htmlFor="transit-slider" className="mb-1 block font-semibold text-slate-700">
                Walking Transit Buffer:{" "}
                <span className="font-mono font-bold text-blue-700">{transit} min</span>
              </label>
              <input
                id="transit-slider"
                type="range"
                min={10}
                max={25}
                step={5}
                value={transit}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setTransit(value);
                  onToast(
                    `Preview only — this control is not connected to the solver (${value} min)`
                  );
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-blue-200 accent-blue-600"
              />
            </div>

            <div>
              <label htmlFor="capacity-target" className="mb-1 block font-semibold text-slate-700">
                Seating Capacity Target
              </label>
              <select
                id="capacity-target"
                onChange={(e) => onToast(`Target room seating utilization set to ${e.target.value}`)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold focus:ring-2 focus:ring-blue-600"
              >
                <option>85% - 95% (Optimal)</option>
                <option>75% - 85% (Relaxed)</option>
              </select>
            </div>

            <div>
              <span className="mb-1 block font-semibold text-slate-700">Evening Slots Priority (18:30+)</span>
              <button
                type="button"
                onClick={() => onToast("Evening class weight boosted (+15%). Solver updated in 0.031s")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 font-bold text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Moon className="h-3.5 w-3.5 text-blue-600" />
                <span>Prioritize Evening Tracks</span>
              </button>
            </div>
          </div>
        </div>

        {running && (
          <div className="space-y-3 rounded-xl border border-blue-500 bg-slate-900 p-4 text-white shadow-lg">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="flex items-center gap-2 font-bold text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                <span>Illustrative benchmark animation (no solver call)...</span>
              </span>
              <span className="font-bold text-emerald-400">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-800">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="h-5 overflow-hidden font-mono text-[11px] text-slate-300">{log}</div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-col items-start justify-between gap-2 text-xs font-semibold sm:flex-row sm:items-center">
            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <LayoutGrid className="h-4 w-4 text-blue-600" /> Master Schedule Section Matrix
            </span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by course, faculty, or room..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 sm:w-64"
              />
              <button
                type="button"
                onClick={runSolver}
                disabled={running}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 transition-all hover:bg-blue-100 disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5 fill-blue-700" />
                <span>Re-run Solver</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="max-h-64 overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                  <tr>
                    <th className="p-3">Course Code &amp; Name</th>
                    <th className="p-3">Instructor</th>
                    <th className="p-3">Time Slot &amp; Room</th>
                    <th className="p-3">Transit &amp; Facility Proof</th>
                    <th className="p-3 text-right">Proof Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {rows.map((row) => (
                    <tr key={row.code} className="transition-colors hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">
                        {row.code} - {row.name}
                      </td>
                      <td className="p-3">{row.instructor}</td>
                      <td className="p-3 font-mono">{row.slot}</td>
                      <td
                        className={`p-3 font-semibold ${
                          row.proofTone === "purple"
                            ? "text-purple-700"
                            : row.proofTone === "blue"
                              ? "text-blue-700"
                              : "text-emerald-600"
                        }`}
                      >
                        ✓ {row.proof}
                      </td>
                      <td className="p-3 text-right">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          ZERO CONFLICT
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-[11px] text-slate-500">
                        No sections match “{search}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-3 sm:flex-row">
          <div className="text-xs font-medium text-slate-500">
            Active Persona: <strong className="font-bold text-blue-600">{email}</strong>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => {
                downloadMasterCsv();
                onToast("Downloaded schedulesolve_master_timetable_fall2026.csv");
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 sm:flex-none"
            >
              <Download className="h-4 w-4 text-blue-600" />
              <span>Export to SIS / ERP (CSV)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-blue-700 sm:flex-none"
            >
              Close Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
