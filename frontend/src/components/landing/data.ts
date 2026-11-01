// Demo data for the landing-page preview canvas.
//
// The preview is a marketing artefact: it shows the deliverables each role
// receives after signing in. Numbers and rows mirror the design reference
// (local-design/first-page.html) and are intentionally static — the live
// product data arrives only after authentication.

export type Persona = "coordinator" | "instructor" | "student";
export type CanvasMode = "table" | "calendar";

export interface PersonaConfig {
  id: Persona;
  initials: string;
  tabLabel: string;
  roleTitle: string;
  email: string;
  displayName: string;
  accent: "blue" | "purple" | "emerald";
}

export const PERSONAS: Record<Persona, PersonaConfig> = {
  coordinator: {
    id: "coordinator",
    initials: "CO",
    tabLabel: "Admin",
    roleTitle: "Coordinator (Admin)",
    email: "coordinator@schedulesolve.demo",
    displayName: "Term Coordinator",
    accent: "blue",
  },
  instructor: {
    id: "instructor",
    initials: "PC",
    tabLabel: "Faculty",
    roleTitle: "Prof. Chen (Faculty)",
    email: "chen@schedulesolve.demo",
    displayName: "Prof. Chen",
    accent: "purple",
  },
  student: {
    id: "student",
    initials: "CS",
    tabLabel: "Student",
    roleTitle: "CS Senior (Student Track)",
    email: "cs2025@schedulesolve.demo",
    displayName: "CS 2025 cohort",
    accent: "emerald",
  },
};

export const PERSONA_ORDER: Persona[] = ["coordinator", "instructor", "student"];

export const DEMO_PASSWORD = "demo1234";

// --- Coordinator extract table ---------------------------------------------

export type DeptTone = "blue" | "indigo" | "purple" | "amber";

export interface ExtractRow {
  id: string;
  code: string;
  title: string;
  dept: string;
  deptTone: DeptTone;
  instructor: string;
  room: string;
  slot: string;
  slotTag: "Morning" | "Afternoon" | "Evening";
  weeks: string;
  // Filter facets (matched against the dropdown values).
  facets: {
    dept: string;
    building: string;
    day: string;
    week: string;
    time: "Morning" | "Afternoon" | "Evening";
  };
}

export const EXTRACT_ROWS: ExtractRow[] = [
  {
    id: "cs101",
    code: "CS 101",
    title: "Intro Programming",
    dept: "CS",
    deptTone: "blue",
    instructor: "Prof. Chen",
    room: "Science 201 (Science)",
    slot: "MWF 09:00 - 10:30",
    slotTag: "Morning",
    weeks: "Weeks 1-16",
    facets: { dept: "CS", building: "Science", day: "Mon,Wed,Fri", week: "W1-16", time: "Morning" },
  },
  {
    id: "math204",
    code: "MATH 204",
    title: "Calculus II",
    dept: "MATH",
    deptTone: "indigo",
    instructor: "Dr. Vance",
    room: "Hall A (Science Annex)",
    slot: "TTh 10:30 - 12:00",
    slotTag: "Morning",
    weeks: "Weeks 1-16",
    facets: { dept: "MATH", building: "Hall A", day: "Tue,Thu", week: "W1-16", time: "Morning" },
  },
  {
    id: "cs401",
    code: "CS 401",
    title: "Advanced Algorithms",
    dept: "CS",
    deptTone: "blue",
    instructor: "Prof. Chen",
    room: "Engineering 104 (Engineering)",
    slot: "TTh 14:00 - 15:30",
    slotTag: "Afternoon",
    weeks: "Weeks 1-16",
    facets: { dept: "CS", building: "Engineering", day: "Tue,Thu", week: "W1-16", time: "Afternoon" },
  },
  {
    id: "phys301",
    code: "PHYS 301",
    title: "Quantum Mechanics",
    dept: "PHYS",
    deptTone: "purple",
    instructor: "Prof. Thorne",
    room: "Phys Lab 4 (Physics)",
    slot: "MWF 13:00 - 14:30",
    slotTag: "Afternoon",
    weeks: "Weeks 1-16",
    facets: { dept: "PHYS", building: "Phys Lab", day: "Mon,Wed,Fri", week: "W1-16", time: "Afternoon" },
  },
  {
    id: "bus490",
    code: "BUS 490",
    title: "Evening Capstone",
    dept: "BUS",
    deptTone: "amber",
    instructor: "Dr. Miller",
    room: "Exec Annex 12 (Exec Annex)",
    slot: "MW 18:30 - 20:00",
    slotTag: "Evening",
    weeks: "Weeks 1-16",
    facets: { dept: "BUS", building: "Exec Annex", day: "Mon,Wed", week: "W1-16", time: "Evening" },
  },
];

export const EXTRACT_FILTERS = {
  dept: [
    ["ALL", "All Departments"],
    ["CS", "Computer Science"],
    ["MATH", "Mathematics"],
    ["PHYS", "Physics"],
    ["BUS", "Business"],
  ],
  building: [
    ["ALL", "All Buildings"],
    ["Science", "Science Center"],
    ["Hall A", "Science Hall A"],
    ["Engineering", "Engineering Hall"],
    ["Phys Lab", "Physics Lab"],
    ["Exec Annex", "Exec Annex"],
  ],
  day: [
    ["ALL", "All Days of Week"],
    ["Mon", "Monday"],
    ["Tue", "Tuesday"],
    ["Wed", "Wednesday"],
    ["Thu", "Thursday"],
    ["Fri", "Friday"],
  ],
  week: [
    ["ALL", "Full Term (Weeks 1-16)"],
    ["W1-4", "Early Term (W1-4)"],
    ["W5-12", "Mid Term (W5-12)"],
    ["W13-16", "Late Term (W13-16)"],
  ],
  time: [
    ["ALL", "Any Time Slot"],
    ["Morning", "Morning (08:00 - 12:00)"],
    ["Afternoon", "Afternoon (12:00 - 17:00)"],
    ["Evening", "Evening (17:00 - 22:00)"],
  ],
} as const;

export type FilterState = { dept: string; building: string; day: string; week: string; time: string };

export const EMPTY_FILTERS: FilterState = {
  dept: "ALL",
  building: "ALL",
  day: "ALL",
  week: "ALL",
  time: "ALL",
};

export function matchesFilters(row: ExtractRow, f: FilterState): boolean {
  const facets = row.facets;
  return (
    (f.dept === "ALL" || facets.dept === f.dept) &&
    (f.building === "ALL" || facets.building.includes(f.building)) &&
    (f.day === "ALL" || facets.day.includes(f.day)) &&
    (f.week === "ALL" || facets.week === f.week || f.week === "W1-4") &&
    (f.time === "ALL" || facets.time === f.time)
  );
}

// --- Instructor deliverable -------------------------------------------------

export interface InstructorSection {
  code: string;
  title: string;
  credits: string;
  slot: string;
  equipment: string;
}

export const INSTRUCTOR_SECTIONS: InstructorSection[] = [
  {
    code: "CS 101",
    title: "Intro Programming",
    credits: "3.0 Cr",
    slot: "T 18:00 - 21:00 • Science 201",
    equipment: "Dual Projectors & Lab Workstations Ready",
  },
  {
    code: "CS 241",
    title: "Discrete Mathematics",
    credits: "3.0 Cr",
    slot: "TTh 14:30 - 16:00 • Engineering 104",
    equipment: "Smartboard & Tiered Seating Confirmed",
  },
  {
    code: "CS 401",
    title: "Advanced Algorithms",
    credits: "3.0 Cr",
    slot: "TTh 16:00 - 17:30 • Engineering 104",
    equipment: "Smartboard & Tiered Seating Confirmed",
  },
];

export const INSTRUCTOR_PREFERENCES = {
  teaching: [
    ["Assigned Courses:", "CS 101, CS 241, CS 401"],
    ["Preferred Days:", "Tuesday & Thursday (T, Th)"],
    ["Class Duration:", "1.5-hour & 3-hour blocks"],
  ],
  personal: [
    ["Childcare Commitment:", "No classes Mon, Fri (M, F)"],
    ["Daily Mindfulness:", "Meditation window 08:00 - 10:00"],
    ["Transit Time:", "Min 10-min walk buffer between halls"],
  ],
};

// --- Student deliverable ----------------------------------------------------

export interface StudentCourse {
  code: string;
  title: string;
  slot: string;
  kind: "core" | "elective";
  note: string;
}

export const STUDENT_COURSES: StudentCourse[] = [
  { code: "CS 401", title: "Advanced Algorithms", slot: "TTh 14:00", kind: "core", note: "No Conflict" },
  { code: "MATH 301", title: "Data Science Stats", slot: "MW 11:00", kind: "core", note: "No Conflict" },
  { code: "CS 490", title: "Senior Thesis Lab", slot: "MW 15:00", kind: "core", note: "No Conflict" },
  { code: "GEN 201", title: "Ethics in AI", slot: "Evening 18:30", kind: "elective", note: "Working Prof. Friendly" },
];

// --- Analytics workspace modal ---------------------------------------------

export interface MasterRow {
  code: string;
  name: string;
  instructor: string;
  slot: string;
  proof: string;
  proofTone: "emerald" | "purple" | "blue";
}

export const MASTER_ROWS: MasterRow[] = [
  {
    code: "CS 101",
    name: "Intro Programming",
    instructor: "Prof. H. Chen",
    slot: "MWF 09:00 - Sci 201",
    proof: "15m Buffer • Projectors Ready",
    proofTone: "emerald",
  },
  {
    code: "MATH 204",
    name: "Calculus II",
    instructor: "Dr. M. Vance",
    slot: "TTh 10:30 - Hall A",
    proof: "20m Buffer • 85% Capacity Fit",
    proofTone: "emerald",
  },
  {
    code: "PHYS 301",
    name: "Quantum Mechanics",
    instructor: "Prof. R. Thorne",
    slot: "MWF 13:00 - Phys Lab 4",
    proof: "Zero Overlap • Special Lab Fit",
    proofTone: "emerald",
  },
  {
    code: "BUS 490",
    name: "Evening Capstone",
    instructor: "Dr. S. Miller",
    slot: "MW 18:30 - Exec Annex 12",
    proof: "Working Professional Track",
    proofTone: "purple",
  },
  {
    code: "CS 401",
    name: "Advanced Algorithms",
    instructor: "Prof. H. Chen",
    slot: "TTh 14:00 - Eng 104",
    proof: "Cohort 4-Course Deadlock Free",
    proofTone: "blue",
  },
];

export const CSV_CONTENT = [
  "Course Code,Course Name,Instructor,Time Slot,Facility Room,Transit Buffer,Proof Status",
  "CS 101,Intro Programming,Prof. H. Chen,MW 09:00,Science 201,15 min buffer,ZERO CONFLICT",
  "MATH 204,Calculus II,Dr. M. Vance,TTh 10:30,Hall A,20 min buffer,ZERO CONFLICT",
  "PHYS 301,Quantum Mechanics,Prof. R. Thorne,MW 13:00,Physics Lab 4,15 min buffer,ZERO CONFLICT",
  "BUS 490,Evening Capstone,Dr. S. Miller,MW 18:30,Exec Annex 12,Evening Track,ZERO CONFLICT",
  "CS 401,Advanced Algorithms,Prof. H. Chen,TTh 14:00,Engineering 104,15 min buffer,ZERO CONFLICT",
  "GEN 201,Ethics in AI,Dr. E. Brooks,TTh 18:30,Humanities 10,Evening Track,ZERO CONFLICT",
].join("\n");

export const SOLVER_LOGS = [
  "Initializing Z3 SMT Solver & OR-Tools CP-SAT Kernel...",
  "Parsing 3,420 hard constraints (room sizes, transit buffers, teaching loads)...",
  "Evaluating 12,800 soft preference optimization weights...",
  "Parallel Race: Z3 SMT finished in 0.034s | CP-SAT in 0.038s",
  "OPTIMAL SOLUTION FOUND — 0 Conflicts, 100% Constraints Satisfied.",
];
