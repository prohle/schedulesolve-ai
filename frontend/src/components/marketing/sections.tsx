"use client";

// Lower half of the marketing landing page: analytics, facility grid, proof
// cards, both ROI calculators, the testimonial, FAQ and the strategy form.
// Ported from local-design/landing-page.html.

import { useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Footprints,
  GraduationCap,
  HelpCircle,
  LineChart,
  MapPin,
  Radar,
  ShieldCheck,
  Star,
  UserCheck,
} from "lucide-react";
import { EChart } from "@/components/ui/echart";
import {
  FAQS,
  FACILITIES,
  FACILITY_TABS,
  PROOFS,
  calculatorGains,
  facultyRadarOption,
  roiGains,
  trafficOption,
  type FacilityCategory,
  type ProofKey,
} from "./data";

/* ------------------------------------------------------------------ */
/* Analytics                                                          */
/* ------------------------------------------------------------------ */

export function AnalyticsSection({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section id="analytics" className="mx-auto max-w-[1800px] px-4 sm:px-8">
      <div className="space-y-4 rounded-3xl border border-editorial-border bg-white p-6 shadow-editorial sm:p-8">
        <div className="flex flex-col gap-3 border-b border-editorial-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-teal-brand-200 bg-teal-brand-50 text-teal-brand-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-navy-900">
                Live Campus Analytics &amp; Load Telemetry
              </h3>
              <p className="text-xs font-medium text-slate-500">
                Real-time student load curves, multi-quad comparisons &amp; faculty preference
                match radar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 rounded-xl border border-editorial-border bg-slate-50 px-4 py-2 text-xs font-bold text-navy-900 transition-all hover:bg-slate-100"
          >
            <span>{open ? "Hide Telemetry" : "Show Telemetry"}</span>
            <ChevronUp
              className={`h-4 w-4 text-slate-500 transition-transform ${open ? "" : "-rotate-180"}`}
            />
          </button>
        </div>

        <div className={`analytics-collapsible ${open ? "" : "collapsed"}`}>
          <div className="analytics-inner pt-2">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-2 rounded-2xl border border-editorial-border bg-slate-50/80 p-4 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-1 border-b border-editorial-border pb-2">
                  <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                    <LineChart className="h-4 w-4 text-teal-brand-600" />
                    <span>Campus Time-of-Day Traffic &amp; Student Load Curve</span>
                  </h4>
                  <span className="text-[10.5px] font-bold text-slate-500">
                    Peak Window: 10:00–11:30
                  </span>
                </div>
                <EChart
                  option={trafficOption}
                  className="h-60 w-full"
                  label="Campus student load by time of day"
                />
              </div>

              <div className="flex flex-col justify-between gap-2 space-y-2 rounded-2xl border border-editorial-border bg-slate-50/80 p-4 lg:col-span-5">
                <div className="space-y-1">
                  <h4 className="flex items-center gap-2 border-b border-editorial-border pb-2 text-xs font-extrabold text-slate-800">
                    <Radar className="h-4 w-4 text-teal-brand-600" />
                    <span>Faculty Schedule Preference Match Index</span>
                  </h4>
                  <p className="text-[11px] font-medium text-slate-500">
                    Preference-match index computed from the live faculty model after sign-in.
                  </p>
                </div>

                <EChart
                  option={facultyRadarOption}
                  className="h-48 w-full"
                  label="Faculty preference match radar"
                />

                <div className="flex items-center justify-between rounded-xl border border-editorial-border bg-white p-2.5 text-[11px] font-semibold text-slate-700 shadow-xs">
                  <span>Highest Preference Match:</span>
                  <span className="font-bold text-teal-brand-700">100% Workload Compliance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Facilities                                                         */
/* ------------------------------------------------------------------ */

export function FacilitiesSection() {
  const [filter, setFilter] = useState<"all" | FacilityCategory>("all");
  const visible = useMemo(
    () => FACILITIES.filter((facility) => filter === "all" || facility.category === filter),
    [filter]
  );

  return (
    <section id="facilities" className="relative bg-white py-16 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-sky-600">
              Institutional Asset Intelligence
            </span>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              CAMPUS FACILITY &amp; CLASSROOM MATRIX
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Illustrative demo campus — the signed-in app uses your institution&apos;s rooms.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 text-xs font-bold">
            {FACILITY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={
                  filter === tab.key
                    ? "rounded-xl bg-white px-3.5 py-2 whitespace-nowrap text-sky-700 shadow-xs"
                    : "rounded-xl px-3.5 py-2 whitespace-nowrap text-slate-600 hover:text-slate-900"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((facility) => (
            <div
              key={facility.id}
              className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm transition-all duration-300 hover:shadow-card-hover"
            >
              <div className="relative h-52 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={facility.image}
                  alt={facility.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <div className="absolute top-3 left-3 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
                  CODE: {facility.code}
                </div>
                <div
                  className={`absolute right-3 bottom-3 rounded-lg ${facility.statusTone} px-2.5 py-1 text-[10px] font-bold text-white shadow-sm`}
                >
                  {facility.status}
                </div>
              </div>

              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">{facility.title}</h3>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {facility.quad}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-1 text-xs font-medium text-slate-600">
                  {facility.specs.map((spec) => (
                    <div key={spec}>{spec}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Constraint proofs                                                  */
/* ------------------------------------------------------------------ */

const PROOF_ICONS = {
  utilization: Cpu,
  cohort: GraduationCap,
  walk: MapPin,
  load: UserCheck,
} as const;

export function ProofsSection({ onInspect }: { onInspect: (proof: ProofKey) => void }) {
  return (
    <section id="proofs" className="relative mx-auto max-w-[1800px] space-y-8 px-4 sm:px-8">
      <div className="watermark-bg top-12 left-0 text-[10vw] font-black opacity-[0.025]">
        PROOF ENGINE
      </div>

      <div className="relative z-10 border-b border-editorial-border pb-6">
        <span className="rounded-full border border-teal-brand-200 bg-teal-brand-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-brand-900">
          Solver Proof Engine
        </span>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-navy-900 sm:text-5xl">
          4 Core Institutional Guarantees
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PROOFS.map((proof) => {
          const Icon = PROOF_ICONS[proof.key];
          return (
            <div
              key={proof.key}
              className="group relative flex flex-col justify-between space-y-6 overflow-hidden rounded-3xl border border-editorial-border bg-white p-6 shadow-editorial transition-all duration-300 hover:shadow-teal-glow"
            >
              <div className="space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-brand-200 bg-teal-brand-50 text-teal-brand-600">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black tracking-tight text-navy-900">{proof.title}</h3>
                <p className="text-xs font-medium leading-relaxed text-slate-600">{proof.body}</p>
              </div>

              <div className="flex items-center justify-between border-t border-editorial-border pt-4 text-xs font-bold text-teal-brand-700">
                <span>{proof.metric}</span>
                <button
                  type="button"
                  onClick={() => onInspect(proof.key)}
                  className="hover:underline"
                >
                  Inspect Proof ›
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ROI calculator (solver benchmark)                                  */
/* ------------------------------------------------------------------ */

const RANGE = "h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200";

export function RoiCalculatorSection({ onRequest }: { onRequest: () => void }) {
  const [students, setStudents] = useState(18500);
  const [sections, setSections] = useState(650);
  const [buildings, setBuildings] = useState(16);
  const gains = calculatorGains(students, sections, buildings);

  return (
    <section
      id="roi-calculator"
      className="relative mx-auto max-w-[1800px] space-y-8 px-4 sm:px-8"
    >
      <div className="relative overflow-hidden rounded-3xl border border-editorial-border bg-white p-8 shadow-editorial sm:p-12">
        <div className="watermark-bg -top-6 right-0 text-[10vw] font-black opacity-[0.025]">
          ENTERPRISE ROI
        </div>

        <div className="relative z-10 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div>
              <span className="rounded-full border border-teal-brand-200 bg-teal-brand-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-brand-900">
                Dynamic ROI Engine
              </span>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-navy-900 sm:text-4xl">
                Institutional Impact &amp; Capacity Calculator
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Adjust parameters below to calculate time savings and reclaimed administrative
                budget.
              </p>
            </div>

            <div className="space-y-5 pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label htmlFor="calc-students" className="text-slate-800">
                    Campus Student Population:
                  </label>
                  <span className="text-sm font-black text-teal-brand-700">
                    {students.toLocaleString()} Students
                  </span>
                </div>
                <input
                  id="calc-students"
                  type="range"
                  min={5000}
                  max={45000}
                  step={1000}
                  value={students}
                  onChange={(event) => setStudents(Number(event.target.value))}
                  className={RANGE}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label htmlFor="calc-sections" className="text-slate-800">
                    Course Sections Per Term:
                  </label>
                  <span className="text-sm font-black text-teal-brand-700">
                    {sections.toLocaleString()} Sections
                  </span>
                </div>
                <input
                  id="calc-sections"
                  type="range"
                  min={200}
                  max={2500}
                  step={50}
                  value={sections}
                  onChange={(event) => setSections(Number(event.target.value))}
                  className={RANGE}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <label htmlFor="calc-buildings" className="text-slate-800">
                    Physical Academic Facilities:
                  </label>
                  <span className="text-sm font-black text-teal-brand-700">
                    {buildings} Buildings
                  </span>
                </div>
                <input
                  id="calc-buildings"
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={buildings}
                  onChange={(event) => setBuildings(Number(event.target.value))}
                  className={RANGE}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-6 rounded-2xl border border-editorial-border bg-slate-50 p-6 lg:col-span-5">
            <div className="border-b border-editorial-border pb-3">
              <h3 className="text-base font-black text-navy-900">Projected Institutional Gains</h3>
              <p className="text-[11px] font-medium text-slate-500">
                Illustrative projection — actual gains depend on your institution.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-editorial-border bg-white p-4">
                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                  Scheduling Time
                </div>
                <div className="mt-1 text-2xl font-black text-teal-brand-700">Weeks → seconds</div>
                <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                  Automated Resolution
                </div>
              </div>

              <div className="rounded-xl border border-editorial-border bg-white p-4">
                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                  Seat Capacity Gain
                </div>
                <div className="mt-1 text-2xl font-black text-navy-900">
                  +{gains.capacityPercent}%
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-emerald-700">
                  +{gains.capacityGained.toLocaleString()} Seats Unlocked
                </div>
              </div>

              <div className="rounded-xl border border-editorial-border bg-white p-4">
                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                  Conflict Reduction
                </div>
                <div className="mt-1 text-2xl font-black text-emerald-700">100%</div>
                <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                  0 Student Overlaps
                </div>
              </div>

              <div className="rounded-xl border border-editorial-border bg-white p-4">
                <div className="text-[10px] font-extrabold uppercase text-slate-500">
                  Budget Reclaimed
                </div>
                <div className="mt-1 text-2xl font-black text-teal-brand-700">
                  ${gains.budget.toLocaleString()}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                  Per Academic Year
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onRequest}
              className="w-full rounded-xl bg-navy-900 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-navy-950"
            >
              Download Institutional ROI Analysis
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonial                                                        */
/* ------------------------------------------------------------------ */

export function TestimonialSection({ onRequest }: { onRequest: () => void }) {
  return (
    <section className="mx-auto max-w-[1800px] space-y-8 px-4 sm:px-8">
      <div className="space-y-8 rounded-3xl border border-teal-brand-200/80 bg-teal-brand-50/50 p-8 sm:p-12">
        <div className="flex flex-col items-center justify-between gap-8 border-b border-teal-brand-200 pb-8 md:flex-row">
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center gap-1 text-teal-brand-600">
              {Array.from({ length: 5 }, (_, index) => (
                <Star key={index} className="h-4 w-4 fill-teal-brand-500" />
              ))}
            </div>
            <blockquote className="text-lg font-bold leading-relaxed text-navy-900 sm:text-2xl">
              &quot;From weeks of registrar spreadsheets to seconds of verifiable proof.
              Zero schedule collisions. Zero delayed graduations.&quot;
            </blockquote>
            <p className="text-sm font-extrabold tracking-wide text-teal-brand-700">
              — Huong Le, Founder
            </p>
          </div>

          <button
            type="button"
            onClick={onRequest}
            className="shrink-0 rounded-xl bg-teal-brand-600 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-teal-brand-700"
          >
            Schedule Provost Demo
          </button>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/60 shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/photo-1562774053-701939374585.avif"
            alt="Modern university campus architecture"
            loading="lazy"
            className="h-[320px] w-full object-cover sm:h-[380px]"
          />

          <div className="absolute top-4 right-4 flex max-w-xs items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 font-bold text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900">4-Year Degree Safety</div>
              <div className="text-[11px] font-medium text-slate-500">
                Zero prerequisite sequence collisions
              </div>
            </div>
          </div>

          <div className="absolute right-4 bottom-4 left-4 space-y-2 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900">Central Quad Academic Complex</h4>
                <p className="text-xs font-medium text-slate-500">
                  12 Buildings • 4 Quads • 361-Section Stress Tier
                </p>
              </div>
              <span className="rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800">
                Demo 78.4% Load
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-1 text-[11px] font-semibold text-slate-700">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>0 Deadlocks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Footprints className="h-3.5 w-3.5 text-sky-600" />
                <span>≥12m Walk Buffer</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                <span>14:00 Blackout</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                */
/* ------------------------------------------------------------------ */

export function FaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq-section" className="relative bg-white py-14">
      <div className="mx-auto max-w-4xl space-y-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-purple-700">
            <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, index) => {
            const expanded = open === index;
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fcfaf8] shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? -1 : index)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-extrabold text-slate-900 transition-colors hover:bg-slate-100/80"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
                <div className={`faq-content ${expanded ? "open" : ""}`}>
                  <div>
                    <div className="px-4 pb-4 text-xs font-medium leading-relaxed text-slate-600">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Strategy session + time-saved calculator                           */
/* ------------------------------------------------------------------ */

const INPUT =
  "w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600";

export function StrategySection({
  onToast,
  onSignIn,
}: {
  onToast: (message: string) => void;
  onSignIn: () => void;
}) {
  const [students, setStudents] = useState(18500);
  const [rooms, setRooms] = useState(250);
  const gains = roiGains(students, rooms);

  return (
    <section id="pricing" className="relative bg-white py-16 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-executive lg:col-span-6">
            <div>
              <span className="rounded-md border border-sky-200 bg-sky-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-sky-600">
                Institutional Impact Model
              </span>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                CAMPUS ROI &amp; TIME-SAVED CALCULATOR
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Adjust your university scale to project annual operational efficiency gains.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <label htmlFor="roi-students">Student Enrollment:</label>
                <span className="font-black text-sky-600">
                  {students.toLocaleString()} Students
                </span>
              </div>
              <input
                id="roi-students"
                type="range"
                min={3000}
                max={60000}
                step={500}
                value={students}
                onChange={(event) => setStudents(Number(event.target.value))}
                className={`${RANGE} accent-sky-600`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <label htmlFor="roi-rooms">Physical Rooms &amp; Labs:</label>
                <span className="font-black text-sky-600">{rooms} Rooms</span>
              </div>
              <input
                id="roi-rooms"
                type="range"
                min={40}
                max={800}
                step={10}
                value={rooms}
                onChange={(event) => setRooms(Number(event.target.value))}
                className={`${RANGE} accent-sky-600`}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center font-bold">
              <div>
                <div className="text-xs uppercase text-slate-400">Hours Saved</div>
                <div className="mt-1 text-xl font-black text-slate-900">{gains.hours} hrs</div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-400">Cost Reduction</div>
                <div className="mt-1 text-xl font-black text-emerald-600">
                  ${gains.savings.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-400">Capacity Lift</div>
                <div className="mt-1 text-xl font-black text-sky-600">+{gains.lift}%</div>
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-6">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Executive Consultation
              </span>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                BOOK A CAMPUS STRATEGY SESSION
              </h2>
              <p className="text-sm font-medium text-slate-600">
                Request a tailored matrix benchmark using your university&apos;s course catalog and
                room capacity requirements.
              </p>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.currentTarget.reset();
                onToast("Campus benchmark session requested — our team will follow up.");
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="strategy-name" className="mb-1 block text-xs font-bold text-slate-700">
                    Full Name
                  </label>
                  <input
                    id="strategy-name"
                    type="text"
                    required
                    placeholder="Prof. Sarah Jenkins"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="strategy-email" className="mb-1 block text-xs font-bold text-slate-700">
                    University Email
                  </label>
                  <input
                    id="strategy-email"
                    type="email"
                    required
                    placeholder="s.jenkins@university.edu"
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="strategy-role" className="mb-1 block text-xs font-bold text-slate-700">
                    Institutional Role
                  </label>
                  <select id="strategy-role" className={`${INPUT} font-bold`}>
                    <option>Provost / Vice President</option>
                    <option>University Registrar</option>
                    <option>Department Chair</option>
                    <option>Facilities &amp; Space Planner</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="strategy-quads" className="mb-1 block text-xs font-bold text-slate-700">
                    Campus Quad Count
                  </label>
                  <select id="strategy-quads" className={`${INPUT} font-bold`}>
                    <option>Single Academic Campus</option>
                    <option>Multi-Quad System (2–5 Quads)</option>
                    <option>Enterprise Multi-Campus (6+ Quads)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="strategy-notes" className="mb-1 block text-xs font-bold text-slate-700">
                  Operational Requirements &amp; Constraints
                </label>
                <textarea
                  id="strategy-notes"
                  rows={3}
                  placeholder="Briefly describe your scheduling challenges (e.g., faculty blackout blocks, walk transit buffers)..."
                  className={INPUT}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-sky-600 py-3.5 text-xs font-black tracking-wide text-white shadow-md shadow-sky-600/20 transition-all hover:bg-sky-700 active:scale-95"
              >
                REQUEST CAMPUS BENCHMARK SESSION
              </button>
            </form>

            <p className="text-center text-[11px] font-medium text-slate-500">
              Already have a workspace?{" "}
              <button
                type="button"
                onClick={onSignIn}
                className="font-bold text-teal-brand-700 underline underline-offset-2 hover:text-teal-brand-800"
              >
                Sign in or register
              </button>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
