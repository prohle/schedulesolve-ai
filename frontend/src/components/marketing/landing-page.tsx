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
  LogIn,
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
  { id: 0, label: "08:30", time: "08:30 – 10:00" },
  { id: 1, label: "10:00 Peak", time: "10:00 – 11:30" },
  { id: 2, label: "11:30", time: "11:30 – 13:00" },
  { id: 4, label: "14:00", time: "14:00 – 15:30" },
];

const HOTSPOTS = [
  {
    id: 1,
    title: "Wheeler Hall (Humanities)",
    meta: "1,810 Total Seats • 2 Auditoriums",
    note: "100% Conflict Free",
    noteTone: "text-emerald-400",
    position: "top-[30%] left-[26%]",
    side: "left",
  },
  {
    id: 2,
    title: "Soda Hall (Computer Science)",
    meta: "CS 61A & AI Research Labs",
    note: "92% Peak Workload Fit",
    noteTone: "text-blue-400",
    position: "top-[38%] left-[56%]",
    side: "right",
  },
  {
    id: 3,
    title: "Haas Business Complex",
    meta: "2,000 Seats • MBA Case Rooms",
    note: "100% Faculty Pref Match",
    noteTone: "text-purple-400",
    position: "top-[49%] left-[82%]",
    side: "right",
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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

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
    <div className="landing-page flex min-h-full flex-col justify-between text-slate-900 selection:bg-teal-500 selection:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center border-b border-editorial-border bg-white/90 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 sm:px-8">
          <a href="#hero" className="group flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-navy-900 via-teal-brand-600 to-cyan-brand-500 p-0.5 shadow-md transition-transform group-hover:scale-105">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-navy-950">
                <svg
                  className="h-6 w-6 text-teal-brand-500"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M 25 35 C 25 20, 50 20, 50 35 C 50 50, 25 50, 25 65 C 25 80, 50 80, 50 65"
                    stroke="url(#landingLogoGrad1)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 50 35 C 50 20, 75 20, 75 35 C 75 50, 50 50, 50 65 C 50 80, 75 80, 75 65"
                    stroke="url(#landingLogoGrad2)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle cx="50" cy="50" r="7" fill="#38bdf8" className="animate-pulse" />
                  <defs>
                    <linearGradient id="landingLogoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0a2540" />
                      <stop offset="100%" stopColor="#00a896" />
                    </linearGradient>
                    <linearGradient id="landingLogoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00a896" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="whitespace-nowrap text-lg font-black tracking-tight text-navy-900">
                SCHEDULESOLVE{" "}
                <span className="bg-gradient-to-r from-teal-brand-600 to-cyan-brand-500 bg-clip-text font-black text-transparent">
                  AI
                </span>
              </span>
              <span className="hidden rounded-full border border-teal-brand-200 bg-teal-brand-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest whitespace-nowrap text-teal-brand-800 2xl:inline-block">
                Muse Spark + CP-SAT
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
                <span>Zero-Conflict Timetable Infrastructure</span>
              </div>

              <h1 className="text-4xl leading-[1.05] font-black tracking-tight text-navy-900 sm:text-6xl xl:text-7xl">
                Zero-Conflict Timetable Infrastructure <br />
                <span className="bg-gradient-to-r from-navy-900 via-teal-brand-600 to-cyan-brand-500 bg-clip-text text-transparent">
                  for Modern Universities.
                </span>
              </h1>

              <p className="max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
                A native C++ solver and Google OR-Tools CP-SAT race on identical data, delivering
                solver-proven feasibility, campus-wide spatial optimization, zero cohort deadlocks,
                and faculty workload harmony — while Muse Spark turns messy files and plain English
                into typed constraints.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={scrollToDemo}
                  className="flex items-center gap-2.5 rounded-xl border border-navy-800 bg-navy-900 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-navy-950 active:scale-95"
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

            {/* Campus backdrop + live overlay */}
            <div className="relative lg:col-span-5">
              <div className="group relative overflow-hidden rounded-3xl border border-editorial-border bg-navy-950 shadow-editorial">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/photo-1541829070764-84a7d30dd3f3.avif"
                  alt="University academic quad"
                  className="h-[460px] w-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <div className="absolute inset-0 hidden bg-gradient-to-r from-slate-900 via-transparent to-transparent lg:block" />

                {HOTSPOTS.map((hotspot) => (
                  <div
                    key={hotspot.id}
                    className={`group absolute z-20 ${hotspot.position}`}
                  >
                    <button
                      type="button"
                      onClick={scrollToDemo}
                      aria-label={`Inspect ${hotspot.title}`}
                      className="hotspot-badge flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[10px] font-black text-slate-950 shadow-lg"
                    >
                      {hotspot.id}
                    </button>

                    <div
                      className={`pointer-events-none absolute top-1/2 w-52 -translate-y-1/2 space-y-1 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-white opacity-0 shadow-2xl backdrop-blur-md transition-opacity group-hover:opacity-100 ${
                        hotspot.side === "left" ? "left-8" : "right-8"
                      }`}
                    >
                      <div className="font-extrabold text-amber-400">{hotspot.title}</div>
                      <div className="text-[11px] text-slate-300">{hotspot.meta}</div>
                      <div className={`text-[10px] font-bold ${hotspot.noteTone}`}>
                        {hotspot.note}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-navy-950/95 via-navy-900/40 to-transparent p-6 text-white">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-gradient-to-r from-teal-brand-500 to-cyan-brand-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-navy-950 shadow-xs backdrop-blur-md">
                      DEMO TELEMETRY
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-teal-brand-500/40 bg-teal-brand-500/20 px-2.5 py-1 text-[10px] font-bold text-cyan-brand-400 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-brand-400" />
                      ILLUSTRATIVE CAMPUS
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl border border-navy-700/60 bg-navy-900/80 p-4 backdrop-blur-md">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Active Time Window Scrubber:</span>
                        <span className="font-extrabold text-cyan-brand-400">
                          {HERO_SLOTS.find((entry) => entry.id === slot)?.time ?? "10:00 – 11:30"}{" "}
                          Window
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-[10.5px]">
                        {HERO_SLOTS.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSlot(entry.id)}
                            className={
                              slot === entry.id
                                ? "rounded-xl bg-teal-brand-500 py-2 text-center font-black text-navy-950 shadow-xs transition-all"
                                : "rounded-xl border border-navy-700 bg-navy-800/80 py-2 text-center font-bold text-white transition-all hover:bg-teal-brand-600/40"
                            }
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-3 backdrop-blur-md">
                        <div className="text-[10px] font-extrabold uppercase text-slate-300">
                          Campus Utilization
                        </div>
                        <div className="mt-0.5 text-xl font-black text-white">78.4% Peak</div>
                      </div>
                      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-3 backdrop-blur-md">
                        <div className="text-[10px] font-extrabold uppercase text-slate-300">
                          Students In Class
                        </div>
                        <div className="mt-0.5 text-xl font-black text-cyan-brand-400">
                          12,050 / 15,370
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
