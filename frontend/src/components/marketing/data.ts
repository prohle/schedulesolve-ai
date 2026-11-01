// Static content for the marketing landing page.
//
// Ported from local-design/landing-page.html. The campus model itself lives in
// components/landing/campus-data.ts (shared with the signed-in preview), so the
// numbers here stay in agreement with the rest of the product.

import type { EChartsOption } from "echarts";

export type FacilityCategory = "tech" | "aud" | "humanities";

export interface Facility {
  id: string;
  category: FacilityCategory;
  image: string;
  code: string;
  status: string;
  statusTone: string;
  title: string;
  quad: string;
  specs: string[];
}

// Photography: the design points at Unsplash; these local files are the same
// shots, vendored so the landing page works offline on the demo laptop.
export const FACILITIES: Facility[] = [
  {
    id: "soda-lab",
    category: "tech",
    image: "/photo-1497366216548-37526070297c.avif",
    code: "SODA-201",
    status: "78.4% Occupancy",
    statusTone: "bg-emerald-500",
    title: "Soda Hall Computing Lab",
    quad: "Main Tech Quad",
    specs: ["150 Workstation Seats", "Dual 4K Laser Projection", "10m Transit Buffer", "Robotics & AI Ready"],
  },
  {
    id: "haas-aud",
    category: "aud",
    image: "/photo-1498243691581-b145c3f54a5a.avif",
    code: "HAAS-AUD-A",
    status: "89.2% Peak Load",
    statusTone: "bg-amber-500",
    title: "Haas Executive Auditorium",
    quad: "Business Quad",
    specs: ["300 Tiered Case Seats", "Integrated Voting Pods", "12m Transit Buffer", "Distance Learning Hub"],
  },
  {
    id: "wheeler",
    category: "humanities",
    image: "/photo-1562774053-701939374585.avif",
    code: "WHEEL-15",
    status: "64.0% Optimal",
    statusTone: "bg-sky-500",
    title: "Wheeler Humanities Lecture Center",
    quad: "Central Core",
    specs: ["350 Seminar Seats", "Acoustic Panels", "8m Central Hub", "Multi-Language AV"],
  },
  {
    id: "stanley-bio",
    category: "tech",
    image: "/photo-1497366216548-37526070297c.avif",
    code: "STAN-BIO-4",
    status: "72.1% Occupancy",
    statusTone: "bg-emerald-500",
    title: "Stanley Bioengineering Research Lab",
    quad: "Health Sciences Quad",
    specs: ["60 Wet Lab Stations", "Fume Hood Lockouts", "15m Safety Buffer", "Specialized Storage"],
  },
  {
    id: "evans",
    category: "humanities",
    image: "/photo-1498243691581-b145c3f54a5a.avif",
    code: "EVANS-301",
    status: "94.0% High Load",
    statusTone: "bg-rose-500",
    title: "Evans Math & Stats Seminar",
    quad: "Central Core",
    specs: ["45 Collaborative Seats", "Quad Smartboards", "5m Central Core", "Recorded Capture"],
  },
  {
    id: "law-court",
    category: "aud",
    image: "/photo-1541829070764-84a7d30dd3f3.avif",
    code: "LAW-COURT-1",
    status: "68.5% Optimal",
    statusTone: "bg-sky-500",
    title: "Law Moot Courtroom Facility",
    quad: "Governance Quad",
    specs: ["120 Bench Seats", "Audio Evidence Racks", "10m Transit Buffer", "Hybrid Streaming"],
  },
];

export const FACILITY_TABS: { key: "all" | FacilityCategory; label: string }[] = [
  { key: "all", label: "All Quads" },
  { key: "tech", label: "Science & Tech Labs" },
  { key: "aud", label: "Tiered Auditoriums" },
  { key: "humanities", label: "Humanities Halls" },
];

export type ProofKey = "utilization" | "cohort" | "walk" | "load";

export interface Proof {
  key: ProofKey;
  title: string;
  body: string;
  metric: string;
}

export const PROOFS: Proof[] = [
  {
    key: "utilization",
    title: "Dual SAT/CP Kernel",
    body: "Parallel Z3 SMT and Google OR-Tools CP-SAT kernel resolution in 0.038s. Resolves 361+ section matrices effortlessly.",
    metric: "0.038s Resolution Speed",
  },
  {
    key: "cohort",
    title: "4-Year Cohort Safety",
    body: "Mathematical DAG traversal ensuring mandatory major courses never conflict. Students stay on a 4-year graduation track.",
    metric: "0 Deadlock Guarantee",
  },
  {
    key: "walk",
    title: "Walking Transit Matrix",
    body: "Enforces minimum 12-minute protected cross-quad walking buffers for both students and instructors.",
    metric: "≥12 Min Protected Buffer",
  },
  {
    key: "load",
    title: "Faculty Workload Harmony",
    body: "100% credit compliance with soft preference matching for research blocks, childcare, and meditation windows.",
    metric: "100% Credit Compliance",
  },
];

export const PROOF_DETAILS: Record<
  ProofKey,
  { title: string; formulaLabel: string; formula: string; note: string }
> = {
  utilization: {
    title: "Dual SAT/CP Solver Kernel Formula",
    formulaLabel: "Z3 SMT Objective Function:",
    formula:
      "Maximize Σ (Capacity_Utilized_i / Room_Cap_i) s.t. Hard_Constraints == True",
    note: "Parallel SMT kernel solves room assignments across 361+ sections in 0.038 seconds with zero hard constraint violations.",
  },
  cohort: {
    title: "4-Year Cohort Safety Proof",
    formulaLabel: "Cohort Directed Acyclic Graph (DAG) Check:",
    formula:
      "∀ Course_A, Course_B ∈ Cohort_Required, Time(Course_A) ∩ Time(Course_B) = ∅",
    note: "Guarantees mandatory degree courses for major cohorts never overlap, preventing graduation delay deadlocks.",
  },
  walk: {
    title: "Walking Transit Distance Matrix",
    formulaLabel: "Cross-Quad Transit Constraint:",
    formula:
      "Time_Start(Section_k+1) - Time_End(Section_k) ≥ Walk_Time(Quad_k, Quad_k+1) [≥12 mins]",
    note: "Enforces minimum 12-minute protected travel buffers between all cross-campus academic buildings.",
  },
  load: {
    title: "Faculty Workload & Credit Harmony",
    formulaLabel: "Faculty Workload Compliance:",
    formula:
      "∀ f ∈ Faculty, Assigned_Credits(f) == Required_Teaching_Load(f) [12.0 Credits]",
    note: "100% compliance with teaching credit loads combined with soft preference weights for research blocks.",
  },
};

export const FAQS: { question: string; answer: string }[] = [
  {
    question: "How does the SMT kernel handle complex campus constraints?",
    answer:
      "Traditional greedy algorithms hit deadlocks when handling 100+ room constraints. ScheduleSolve AI runs a parallel race between Microsoft Research's Z3 Satisfiability Modulo Theories (SMT) solver and Google OR-Tools CP-SAT kernel, finding global mathematical optima in under 0.038 seconds.",
  },
  {
    question: "Can we integrate directly with Ellucian Banner, Workday, or Canvas?",
    answer:
      "Yes. ScheduleSolve AI features built-in bidirectional REST APIs and automated CSV export pipelines formatted specifically for Banner ERP, Workday Student, Oracle PeopleSoft, and Canvas LMS.",
  },
  {
    question: "How are hard constraints vs soft faculty preferences prioritized?",
    answer:
      "Hard constraints (room seating capacity, double-booking prevention, cross-quad transit buffers) are strictly enforced at 100% mathematical guarantee. Soft constraints (faculty preferred teaching times, research days) are maximized via multi-objective optimization.",
  },
  {
    question: "How long does campus onboarding take?",
    answer:
      "Most universities complete full data ingestion (building inventory, course catalogs, faculty preferences) within 5 to 7 business days using our guided onboarding tools.",
  },
];

export const WEEK_OPTIONS = [
  { value: "1", label: "Week 1 — Orientation & Term Start" },
  { value: "3", label: "Week 3 — Regular Term Schedule" },
  { value: "6", label: "Week 6 — Midterm Examinations" },
  { value: "9", label: "Week 9 — Spring Recess (Campus Closed)" },
  { value: "15", label: "Week 15 — Final Exam Matrix Override" },
];

export const DAY_OPTIONS = [
  { value: "mon", label: "Monday (Full Regular Schedule)" },
  { value: "tue", label: "Tuesday (Full Regular Schedule)" },
  { value: "wed", label: "Wednesday (14:00 Senate Blackout)" },
  { value: "thu", label: "Thursday (14:00 Dept Blackout)" },
  { value: "fri", label: "Friday (Regular Schedule)" },
];

export const SLOT_OPTIONS = [
  { value: "all", label: "All Time Slots (Daily Matrix)" },
  { value: "0", label: "08:30 – 10:00 (Slot 1 Morning)" },
  { value: "1", label: "10:00 – 11:30 (Slot 2 Peak Window)" },
  { value: "2", label: "11:30 – 13:00 (Slot 3 Midday)" },
  { value: "3", label: "13:00 – 14:00 (Lunch Recess)" },
  { value: "4", label: "14:00 – 15:30 (Slot 5 Afternoon)" },
  { value: "5", label: "16:00 – 17:30 (Slot 6 Late PM)" },
  { value: "6", label: "18:00 – 21:00 (Slot 7 Evening Track)" },
];

/** Heatmap tone classes (design uses cyan/teal rather than the app's amber). */
export function heatColor(percent: number, isBlackout = false): string {
  if (isBlackout) return "pattern-blackout text-teal-brand-950 border-teal-brand-300 font-bold";
  if (percent < 40)
    return "bg-emerald-100 text-emerald-950 border-emerald-300 hover:border-emerald-500 font-bold";
  if (percent <= 75)
    return "bg-cyan-100 text-cyan-950 border-cyan-300 hover:border-cyan-500 font-bold";
  if (percent <= 90)
    return "bg-teal-100 text-teal-950 border-teal-300 hover:border-teal-500 font-bold";
  return "bg-rose-100 text-rose-950 border-rose-300 hover:border-rose-500 font-bold shadow-xs";
}

export const trafficOption: EChartsOption = {
  backgroundColor: "transparent",
  textStyle: { fontFamily: "Inter, sans-serif" },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    textStyle: { color: "#0f172a", fontFamily: "Inter, sans-serif" },
  },
  grid: { top: 15, bottom: 20, left: 45, right: 15 },
  xAxis: {
    type: "category",
    data: ["08:30", "10:00 Peak", "11:30", "13:00 Recess", "14:00", "16:00", "18:00 Eve"],
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisLabel: { color: "#334155", fontSize: 10, fontWeight: "bold" },
  },
  yAxis: {
    type: "value",
    max: 16000,
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisLabel: { color: "#334155", fontSize: 10 },
    splitLine: { lineStyle: { color: "#e2e8f0" } },
  },
  series: [
    {
      name: "Main Campus",
      type: "line",
      smooth: true,
      data: [4600, 6800, 6000, 800, 5100, 3900, 2200],
      lineStyle: { color: "#00a896", width: 2.5 },
    },
    {
      name: "Engineering Quad",
      type: "line",
      smooth: true,
      data: [1500, 2150, 1900, 300, 1750, 1200, 750],
      lineStyle: { color: "#0a2540", width: 2.5 },
    },
    {
      name: "Business Quad",
      type: "line",
      smooth: true,
      data: [1600, 2250, 2050, 250, 1850, 1400, 850],
      lineStyle: { color: "#06b6d4", width: 2.5 },
    },
  ],
};

export const facultyRadarOption: EChartsOption = {
  backgroundColor: "transparent",
  textStyle: { fontFamily: "Inter, sans-serif" },
  tooltip: {},
  radar: {
    indicator: [
      { name: "Workload Limit", max: 100 },
      { name: "Time Window", max: 100 },
      { name: "Course Preference", max: 100 },
      { name: "Transit Buffer", max: 100 },
      { name: "Equipment Fit", max: 100 },
    ],
    radius: "62%",
    axisName: { color: "#334155", fontSize: 10, fontWeight: "bold" },
  },
  series: [
    {
      type: "radar",
      data: [
        {
          value: [100, 96, 100, 98, 98],
          name: "Faculty Preference Match Index",
          areaStyle: { color: "rgba(0, 168, 150, 0.25)" },
          lineStyle: { color: "#00a896", width: 2 },
        },
      ],
    },
  ],
};

/** ROI formulas. The reference calls updateROI()/handleStrategyForm() but never
 *  defines them, so these are filled in to keep the controls honest. */
export function calculatorGains(students: number, sections: number, buildings: number) {
  const budget = Math.round(students * 16 + sections * 100 + buildings * 1500);
  const capacityGained = Math.round(buildings * 140 + sections * 0.8);
  return {
    budget,
    capacityGained,
    capacityPercent: ((capacityGained / 15000) * 100).toFixed(1),
  };
}

export function roiGains(students: number, rooms: number) {
  const hours = Math.round(students * 0.01 + rooms * 0.94);
  const savings = Math.round((hours * 440) / 1000) * 1000;
  const lift = (15 + rooms * 0.0136).toFixed(1);
  return { hours, savings, lift };
}
