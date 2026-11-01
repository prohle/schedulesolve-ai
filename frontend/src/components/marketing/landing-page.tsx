"use client";

// Marketing landing page (route: /).
//
// Faithful React port of local-design/landing-page.html: editorial hero with a
// live campus scrubber, the interactive matrix demo, telemetry charts, facility
// grid, constraint proofs, ROI calculators, testimonial, FAQ and strategy form.
// The signed-in product now lives at /login-register and /dashboard.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  FileText,
  LayoutGrid,
  LogIn,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { MatrixDemo } from "./matrix-demo";
import { BenchmarkModal, ProofModal } from "./modals";
import {
  AnalyticsSection,
  FacilitiesSection,
  FaqSection,
  ProofsSection,
  RoiCalculatorSection,
  StrategySection,
  TestimonialSection,
} from "./sections";
import type { ProofKey } from "./data";

const NAV_LINKS = [
  { href: "#demo-app", label: "Matrix Engine" },
  { href: "#facilities", label: "Facilities & Quads" },
  { href: "#analytics", label: "Telemetry" },
  { href: "#proofs", label: "Constraint Proofs" },
  { href: "#roi-calculator", label: "ROI Calculator" },
  { href: "#pricing", label: "Enterprise Tiers" },
];

const HERO_SLOTS = [
  {
    id: 0,
    label: "08:30",
    time: "08:30 – 10:00",
    utilization: "34.2%",
    utilBadge: "Low Load",
    utilTone: "border-slate-700 bg-slate-800 text-slate-300",
    students: "5,260 / 15,370",
    density: "36% Capacity",
  },
  {
    id: 1,
    label: "10:00 Peak",
    time: "10:00 – 11:30",
    utilization: "78.4% Peak",
    utilBadge: "Optimal Flow",
    utilTone: "border-emerald-500/30 bg-emerald-950/80 text-emerald-400",
    students: "12,050 / 15,370",
    density: "84% Capacity",
  },
  {
    id: 2,
    label: "11:30",
    time: "11:30 – 13:00",
    utilization: "82.1% Peak",
    utilBadge: "High Density",
    utilTone: "border-amber-500/30 bg-amber-950/80 text-amber-400",
    students: "12,610 / 15,370",
    density: "91% Capacity",
  },
  {
    id: 4,
    label: "14:00",
    time: "14:00 – 15:30",
    utilization: "61.8%",
    utilBadge: "Balanced",
    utilTone: "border-cyan-500/30 bg-cyan-950/80 text-cyan-300",
    students: "9,490 / 15,370",
    density: "65% Capacity",
  },
];

const HERO_PINS = [
  {
    id: 1,
    position: "top-[30%] left-[26%] sm:top-[32%] sm:left-[28%]",
    title: "Node #1: HVAC & Audio Grid",
    lines: ["Ambient Temp: 71.2°F", "Acoustic Profile: Optimal"],
    toastTitle: "Node #1: Overhead Infrastructure & Acoustic Grid",
    toastDesc:
      "Monitors ambient noise profiles, overhead LED climate controls, and HVAC airflow in primary lecture zones.",
    align: "center",
  },
  {
    id: 2,
    position: "top-[44%] left-[56%] sm:top-[42%] sm:left-[58%]",
    title: "Node #2: Center Tier Occupancy",
    lines: ["Density: {density}", "ADA Accessible Routes: Verified"],
    toastTitle: "Node #2: Mid-Tier Seating Cluster & Desk Capacity",
    toastDesc:
      "Calculates real-time student desk occupancy, wheelchair accessibility clearances, and seat distance ratios.",
    align: "center",
  },
  {
    id: 3,
    position: "top-[52%] left-[80%] sm:top-[50%] sm:left-[82%]",
    title: "Node #3: Quad Access Buffer",
    lines: ["Transit Buffer: 4.2 min", "Next Class Swap: 11:30 AM"],
    toastTitle: "Node #3: Quad Access & Transit Buffer Zone",
    toastDesc:
      "Tracks inter-building student flow to ensure 10-minute pass-through windows between back-to-back classes.",
    align: "right",
  },
];

function scrollToDemo() {
  document.getElementById("demo-app")?.scrollIntoView({ behavior: "smooth" });
}

export function LandingPage() {
  const router = useRouter();
  const [slot, setSlot] = useState(1);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [proof, setProof] = useState<ProofKey | null>(null);
  const [pinToast, setPinToast] = useState<number | null>(null);
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [autoScrub, setAutoScrub] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const activeSlot = HERO_SLOTS.find((entry) => entry.id === slot) ?? HERO_SLOTS[1];
  const activePin = HERO_PINS.find((pin) => pin.id === pinToast) ?? null;

  // Auto-scrub cycles the four hero telemetry windows every 2.2s.
  useEffect(() => {
    if (!autoScrub) return;
    const timer = window.setInterval(() => {
      setSlot((current) => {
        const index = HERO_SLOTS.findIndex((entry) => entry.id === current);
        return HERO_SLOTS[(index + 1) % HERO_SLOTS.length].id;
      });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [autoScrub]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  function signIn() {
    router.push("/login-register");
  }

  return (
    <div className="landing-page flex min-h-full flex-col justify-between text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center border-b border-editorial-border bg-white/90 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 sm:px-8">
          <a href="#hero" className="group flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="ScheduleSolve AI"
              width={329}
              height={237}
              className="h-10 w-auto shrink-0 object-contain transition-transform duration-300 group-hover:scale-105"
            />

            <div className="hidden flex-col items-start leading-tight sm:flex">
              <span className="whitespace-nowrap text-lg font-black tracking-tight text-navy-900">
                SCHEDULESOLVE{" "}
                <span className="bg-gradient-to-r from-teal-brand-600 to-cyan-brand-500 bg-clip-text font-black text-transparent">
                  AI
                </span>
              </span>
              <span className="text-[10px] font-semibold tracking-wide text-slate-500">
                Powered by Meta Muse Spark
              </span>
            </div>
          </a>

          <nav className="hidden items-center gap-5 text-[11px] font-extrabold uppercase tracking-wider text-slate-600 xl:flex xl:text-xs">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap transition-colors hover:text-teal-brand-600"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={scrollToDemo}
              className="hidden items-center gap-2 rounded-xl border border-editorial-border bg-slate-100 px-3.5 py-2 text-xs font-bold whitespace-nowrap text-navy-900 shadow-xs transition-all hover:bg-slate-200 active:scale-95 2xl:flex"
            >
              <Eye className="h-3.5 w-3.5 text-teal-brand-600" />
              <span>Launch Live Demo</span>
            </button>

            <Link
              href="/login-register"
              className="flex items-center gap-2 rounded-xl border border-teal-brand-200 bg-teal-brand-50 px-3.5 py-2 text-xs font-bold whitespace-nowrap text-teal-brand-900 shadow-xs transition-all hover:bg-teal-brand-100 active:scale-95"
            >
              <LogIn className="h-3.5 w-3.5 text-teal-brand-600" />
              <span>Sign In</span>
            </Link>

            <button
              type="button"
              onClick={() => setBenchmarkOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy-900 via-teal-brand-700 to-teal-brand-600 px-3.5 py-2 text-xs font-bold whitespace-nowrap text-white shadow-md transition-all hover:from-navy-950 hover:to-teal-brand-700 active:scale-95 sm:px-4"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-brand-400" />
              <span className="hidden lg:inline">Executive Request</span>
              <span className="lg:hidden">Request</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full space-y-20 py-8">
        {/* Hero */}
        <section
          id="hero"
          className="relative mx-auto max-w-[1800px] overflow-hidden px-4 pt-4 pb-12 sm:px-8"
        >
          <div className="watermark-bg -top-6 left-0 text-[12vw] font-black opacity-[0.03] sm:text-[14vw]">
            SPATIAL MATRIX
          </div>

          <div className="relative z-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-teal-brand-200 bg-teal-brand-50 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-widest text-teal-brand-900 shadow-xs">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-brand-500" />
                <span>Lightning-Fast Campus Scheduling</span>
              </div>

              <h1 className="text-4xl leading-[1.05] font-black tracking-tight text-navy-900 sm:text-6xl xl:text-7xl">
                Perfect College Schedules{" "}
                <span className="bg-gradient-to-r from-navy-900 via-teal-brand-600 to-cyan-brand-500 bg-clip-text text-transparent">
                  in Seconds.
                </span>
                <span className="block bg-gradient-to-r from-teal-brand-600 to-cyan-brand-500 bg-clip-text text-transparent">
                  Verified Step-by-Step.
                </span>
              </h1>

              <p className="max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
                Drop in messy school files. ScheduleSolve AI pairs deterministic math with Meta’s
                Muse Spark to generate zero-conflict timetables, protect graduation paths, and
                balance faculty workloads.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={scrollToDemo}
                  className="flex items-center gap-2.5 rounded-xl border border-blue-700 bg-blue-600 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
                >
                  <Play className="h-4 w-4 text-cyan-brand-400" />
                  <span>Launch Live Matrix Demo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBenchmarkOpen(true)}
                  className="flex items-center gap-2.5 rounded-xl border border-editorial-border bg-white px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-navy-900 shadow-xs transition-all hover:bg-slate-50 active:scale-95"
                >
                  <FileText className="h-4 w-4 text-teal-brand-600" />
                  <span>Request Campus ROI Report</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-editorial-border pt-6 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-xl font-black tracking-tight text-navy-900">29 ms</div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    University-Scale Solve
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black tracking-tight text-teal-brand-600">100%</div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Solver-Proven Feasibility
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black tracking-tight text-navy-900">361</div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Stress-Tier Sections
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black tracking-tight text-teal-brand-600">+20%</div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Growth What-If
                  </div>
                </div>
              </div>
            </div>

            {/* Campus backdrop + live telemetry overlay */}
            <div className="relative lg:col-span-5">
              <div className="group/hero relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
                <div className="relative h-[480px] w-full overflow-hidden sm:h-[540px] md:h-[600px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/photo-1562774053-701939374585.avif"
                    alt="University lecture hall infrastructure"
                    className="h-full w-full scale-[1.01] object-cover object-center transition-transform duration-700 group-hover/hero:scale-105"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/50" />
                  <div
                    className={`heatmap-grid pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                      heatmapOn ? "opacity-60" : "opacity-0"
                    }`}
                  />

                  {/* Top badges */}
                  <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
                    <div className="glass-badge-live flex items-center gap-2.5 rounded-full px-3.5 py-1.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        LIVE TELEMETRY
                      </span>
                    </div>
                  </div>
                  <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
                    <div className="glass-badge-subtle flex items-center gap-2 rounded-full px-3.5 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-300">
                        ILLUSTRATIVE CAMPUS
                      </span>
                    </div>
                  </div>

                  {/* Interactive telemetry pins */}
                  {HERO_PINS.map((pin) => (
                    <div key={pin.id} className={`group/pin absolute z-30 ${pin.position}`}>
                      <button
                        type="button"
                        onClick={() => setPinToast(pin.id)}
                        aria-label={`Inspect telemetry pin ${pin.id}: ${pin.title}`}
                        className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-400 bg-slate-900/90 text-xs font-bold text-emerald-300 shadow-lg shadow-emerald-950/80 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      >
                        <span className="pin-pulse" />
                        {pin.id}
                      </button>

                      <div
                        className={`glass-panel pointer-events-none absolute bottom-full mb-2 hidden w-48 flex-col rounded-xl p-2.5 text-xs group-hover/pin:flex ${
                          pin.align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
                        }`}
                      >
                        <span className="mb-0.5 font-semibold text-emerald-400">
                          {pin.title}
                        </span>
                        {pin.lines.map((line) => (
                          <span key={line} className="text-slate-300">
                            {line.replace("{density}", activeSlot.density)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Floating glass telemetry cards */}
                  <div className="absolute bottom-3 left-3 right-3 z-30 flex flex-col gap-3 sm:bottom-6 sm:left-6 sm:right-6">
                    <div className="glass-panel w-full rounded-2xl p-3.5 sm:p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-400 sm:text-sm">
                          Active Time Window Scrubber:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold tracking-wide text-teal-400 transition-all duration-300 sm:text-sm">
                            {activeSlot.time} Window
                          </span>
                          <button
                            type="button"
                            onClick={() => setHeatmapOn((value) => !value)}
                            aria-label="Toggle heatmap grid"
                            title="Toggle heatmap grid"
                            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${
                              heatmapOn
                                ? "border-cyan-500/40 bg-cyan-950/60 text-cyan-300"
                                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
                            }`}
                          >
                            <LayoutGrid className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAutoScrub((value) => !value)}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${
                              autoScrub
                                ? "border-amber-500/40 bg-amber-950/60 text-amber-300"
                                : "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:text-white"
                            }`}
                          >
                            {autoScrub ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            {autoScrub ? "Pause" : "Auto"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                        {HERO_SLOTS.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSlot(entry.id)}
                            className={
                              slot === entry.id
                                ? "active-time-pill rounded-xl border border-cyan-400/40 px-2 py-2.5 text-center text-xs font-bold text-white transition-all sm:text-sm"
                                : "rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-2.5 text-center text-xs font-medium text-slate-300 transition-all hover:bg-slate-800/80 hover:text-white sm:text-sm"
                            }
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="glass-panel flex flex-col justify-between rounded-2xl p-3.5 sm:p-4">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">
                            CAMPUS UTILIZATION
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${activeSlot.utilTone}`}
                          >
                            {activeSlot.utilBadge}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-extrabold tracking-tight text-white transition-all duration-300 sm:text-2xl md:text-3xl">
                            {activeSlot.utilization}
                          </span>
                        </div>
                      </div>

                      <div className="glass-panel flex flex-col justify-between rounded-2xl p-3.5 sm:p-4">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs">
                            STUDENTS IN CLASS
                          </span>
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                            Active Timetable
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-extrabold tracking-tight text-teal-400 drop-shadow-[0_2px_10px_rgba(45,212,191,0.25)] transition-all duration-300 sm:text-2xl md:text-3xl">
                            {activeSlot.students}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {activePin && (
                <div className="glass-panel mt-4 flex flex-row items-center justify-between rounded-xl border-l-4 border-l-emerald-400 p-4 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-950 text-sm font-bold text-emerald-400">
                      {activePin.id}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{activePin.toastTitle}</h4>
                      <p className="text-xs text-slate-300">{activePin.toastDesc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPinToast(null)}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="mt-4 flex flex-col items-center justify-between gap-2 px-2 text-xs text-slate-400 sm:flex-row">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Proved Feasible
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" /> Native C++ · 35 ms
                  </span>
                </div>
                <span>Powered by Meta Muse Spark + Native C++ Solver</span>
              </div>
            </div>
          </div>
        </section>

        <MatrixDemo slot={slot} onSlotChange={setSlot} onToast={showToast} />

        <AnalyticsSection
          open={analyticsOpen}
          onToggle={() => setAnalyticsOpen((value) => !value)}
        />

        <FacilitiesSection />

        <ProofsSection onInspect={setProof} />

        <RoiCalculatorSection onRequest={() => setBenchmarkOpen(true)} />

        <TestimonialSection onRequest={() => setBenchmarkOpen(true)} />

        <FaqSection />

        <StrategySection onToast={showToast} onSignIn={signIn} />
      </main>

      {/* Footer */}
      <footer className="mt-12 w-full border-t border-editorial-border bg-white px-4 py-6 text-xs text-slate-500 sm:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="font-black text-navy-900">SCHEDULESOLVE AI</span>
            <span className="text-slate-300">|</span>
            <span>Zero-Conflict Timetable Engine</span>
          </div>
          <div className="text-[11px] font-semibold">
            Demo grid: 1.5h standard slots (80m + 10m buffer) &amp; 14:00 blackouts
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login-register" className="font-semibold text-teal-brand-700 hover:underline">
              Sign in / Register
            </Link>
            <span>© 2026 ScheduleSolve AI. All rights reserved.</span>
          </div>
        </div>
      </footer>

      <BenchmarkModal
        open={benchmarkOpen}
        onClose={() => setBenchmarkOpen(false)}
        onSubmitted={() => {
          setBenchmarkOpen(false);
          showToast("Campus benchmark report dispatched to your institutional inbox!");
        }}
      />
      <ProofModal proof={proof} onClose={() => setProof(null)} />

      {/* Toast */}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed right-4 bottom-6 z-50 flex items-center gap-3 rounded-2xl border border-teal-brand-500/40 bg-navy-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl transition-all duration-300 sm:right-6 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-brand-400" />
        <span>{toast ?? "Action confirmed successfully."}</span>
      </div>
    </div>
  );
}
