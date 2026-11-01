// Enterprise campus model for the calendar-matrix preview.
//
// Ported from local-design/calendar-matrix-campus.html: 4 quads, 12 buildings,
// 311 rooms / 15,370 seats, 7 daily slots and a procedural occupancy generator
// so the heatmap reacts to campus, building, week, day and slot filters.

export type SlotType = "std" | "recess" | "eve";

export interface Slot {
  id: number;
  time: string;
  label: string;
  type: SlotType;
  short: string;
}

export const SLOTS: Slot[] = [
  { id: 0, time: "08:30 – 10:00", label: "Slot 1 (Morning)", type: "std", short: "08:30" },
  { id: 1, time: "10:00 – 11:30", label: "Slot 2 (Peak)", type: "std", short: "10:00 Peak" },
  { id: 2, time: "11:30 – 13:00", label: "Slot 3 (Midday)", type: "std", short: "11:30" },
  { id: 3, time: "13:00 – 14:00", label: "Lunch Recess", type: "recess", short: "13:00 Recess" },
  { id: 4, time: "14:00 – 15:30", label: "Slot 5 (Afternoon)", type: "std", short: "14:00" },
  { id: 5, time: "16:00 – 17:30", label: "Slot 6 (Late PM)", type: "std", short: "16:00" },
  { id: 6, time: "18:00 – 21:00", label: "Slot 7 (Evening 3h)", type: "eve", short: "18:00 Eve" },
];

export interface Floor {
  id: string;
  name: string;
  count: number;
  capPerRoom: number;
  isHall: boolean;
  label: string;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  floors: Floor[];
  totalRooms: number;
  totalSeats: number;
}

export interface Campus {
  name: string;
  short: string;
  buildings: Building[];
}

export const CAMPUSES: Record<string, Campus> = {
  main: {
    name: "Main Academic Campus",
    short: "Main Academic",
    buildings: [
      {
        id: "main-wheeler",
        name: "Wheeler Hall (Humanities)",
        code: "WHEEL",
        floors: [
          { id: "g", name: "Ground Floor", count: 2, capPerRoom: 350, isHall: true, label: "2 Large Auditoriums" },
          { id: "1", name: "Floor 1", count: 7, capPerRoom: 45, isHall: false, label: "7 Classrooms" },
          { id: "2", name: "Floor 2", count: 7, capPerRoom: 45, isHall: false, label: "7 Classrooms" },
          { id: "3", name: "Floor 3", count: 7, capPerRoom: 40, isHall: false, label: "7 Classrooms" },
          { id: "4", name: "Floor 4", count: 7, capPerRoom: 35, isHall: false, label: "7 Seminar Rooms" },
        ],
        totalRooms: 30,
        totalSeats: 1810,
      },
      {
        id: "main-evans",
        name: "Evans Hall (Mathematics & Stats)",
        code: "EVANS",
        floors: [
          { id: "1", name: "Floor 1", count: 6, capPerRoom: 40, isHall: false, label: "6 Classrooms" },
          { id: "2", name: "Floor 2", count: 6, capPerRoom: 40, isHall: false, label: "6 Classrooms" },
          { id: "3", name: "Floor 3", count: 6, capPerRoom: 35, isHall: false, label: "6 Math Labs" },
          { id: "4", name: "Floor 4", count: 6, capPerRoom: 35, isHall: false, label: "6 Classrooms" },
          { id: "5", name: "Floor 5", count: 6, capPerRoom: 30, isHall: false, label: "6 Classrooms" },
          { id: "6", name: "Floor 6", count: 4, capPerRoom: 30, isHall: false, label: "4 Stats Labs" },
          { id: "7", name: "Floor 7", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
          { id: "8", name: "Floor 8", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
        ],
        totalRooms: 42,
        totalSeats: 1460,
      },
      {
        id: "main-leconte",
        name: "LeConte Physics Hall",
        code: "LECNT",
        floors: [
          { id: "g", name: "Ground Floor", count: 3, capPerRoom: 240, isHall: true, label: "3 Physics Auditoriums" },
          { id: "1", name: "Floor 1", count: 5, capPerRoom: 35, isHall: false, label: "5 Demo Labs" },
          { id: "2", name: "Floor 2", count: 5, capPerRoom: 35, isHall: false, label: "5 Classrooms" },
          { id: "3", name: "Floor 3", count: 4, capPerRoom: 35, isHall: false, label: "4 Physics Labs" },
          { id: "4", name: "Floor 4", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
        ],
        totalRooms: 21,
        totalSeats: 1260,
      },
      {
        id: "main-dwinelle",
        name: "Dwinelle Hall (Languages & SocSci)",
        code: "DWIN",
        floors: [
          { id: "1", name: "Floor 1", count: 11, capPerRoom: 45, isHall: false, label: "11 Classrooms" },
          { id: "2", name: "Floor 2", count: 11, capPerRoom: 40, isHall: false, label: "11 Classrooms" },
          { id: "3", name: "Floor 3", count: 10, capPerRoom: 35, isHall: false, label: "10 Classrooms" },
          { id: "4", name: "Floor 4", count: 10, capPerRoom: 30, isHall: false, label: "10 Language Labs" },
          { id: "5", name: "Floor 5", count: 10, capPerRoom: 25, isHall: false, label: "10 Seminars" },
        ],
        totalRooms: 52,
        totalSeats: 1785,
      },
      {
        id: "main-soda",
        name: "Soda Hall (CS & Electrical Eng)",
        code: "SODA",
        floors: [
          { id: "g", name: "Ground Floor", count: 2, capPerRoom: 150, isHall: true, label: "2 CS Auditoriums" },
          { id: "1", name: "Floor 1", count: 5, capPerRoom: 50, isHall: false, label: "5 Computing Labs" },
          { id: "2", name: "Floor 2", count: 5, capPerRoom: 45, isHall: false, label: "5 Systems Labs" },
          { id: "3", name: "Floor 3", count: 5, capPerRoom: 40, isHall: false, label: "5 AI/Robotics Rooms" },
          { id: "4", name: "Floor 4", count: 5, capPerRoom: 35, isHall: false, label: "5 Seminars" },
        ],
        totalRooms: 22,
        totalSeats: 1150,
      },
    ],
  },
  eng: {
    name: "Engineering & Applied Tech Quad",
    short: "Engineering",
    buildings: [
      {
        id: "eng-etch",
        name: "Etcheverry Hall (Mech & Aero)",
        code: "ETCH",
        floors: [
          { id: "1", name: "Floor 1", count: 4, capPerRoom: 45, isHall: false, label: "4 Design Labs" },
          { id: "2", name: "Floor 2", count: 4, capPerRoom: 40, isHall: false, label: "4 Aero Labs" },
          { id: "3", name: "Floor 3", count: 4, capPerRoom: 35, isHall: false, label: "4 Classrooms" },
          { id: "4", name: "Floor 4", count: 4, capPerRoom: 35, isHall: false, label: "4 Mech Labs" },
          { id: "5", name: "Floor 5", count: 4, capPerRoom: 30, isHall: false, label: "4 Fluids Labs" },
          { id: "6", name: "Floor 6", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
          { id: "7", name: "Floor 7", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
        ],
        totalRooms: 28,
        totalSeats: 980,
      },
      {
        id: "eng-cory",
        name: "Cory Hall (Microelectronics)",
        code: "CORY",
        floors: [
          { id: "1", name: "Floor 1", count: 4, capPerRoom: 40, isHall: false, label: "4 Cleanroom Labs" },
          { id: "2", name: "Floor 2", count: 4, capPerRoom: 35, isHall: false, label: "4 Circuits Labs" },
          { id: "3", name: "Floor 3", count: 4, capPerRoom: 35, isHall: false, label: "4 Embedded Labs" },
          { id: "4", name: "Floor 4", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
          { id: "5", name: "Floor 5", count: 4, capPerRoom: 25, isHall: false, label: "4 Grad Seminars" },
        ],
        totalRooms: 20,
        totalSeats: 660,
      },
      {
        id: "eng-davis",
        name: "Davis Hall (Civil & Environ Eng)",
        code: "DAVIS",
        floors: [
          { id: "1", name: "Floor 1", count: 4, capPerRoom: 50, isHall: false, label: "4 Structural Labs" },
          { id: "2", name: "Floor 2", count: 4, capPerRoom: 45, isHall: false, label: "4 Geo Labs" },
          { id: "3", name: "Floor 3", count: 4, capPerRoom: 35, isHall: false, label: "4 Classrooms" },
          { id: "4", name: "Floor 4", count: 4, capPerRoom: 30, isHall: false, label: "4 Environmental Labs" },
        ],
        totalRooms: 16,
        totalSeats: 640,
      },
    ],
  },
  biz: {
    name: "Business & Governance Quad",
    short: "Business",
    buildings: [
      {
        id: "biz-haas",
        name: "Haas Business School Complex",
        code: "HAAS",
        floors: [
          { id: "g", name: "Ground Floor", count: 2, capPerRoom: 300, isHall: true, label: "2 Innovation Auditoriums" },
          { id: "1", name: "Floor 1", count: 6, capPerRoom: 65, isHall: false, label: "6 Tiered Case Classrooms" },
          { id: "2", name: "Floor 2", count: 6, capPerRoom: 60, isHall: false, label: "6 Exec Classrooms" },
          { id: "3", name: "Floor 3", count: 6, capPerRoom: 55, isHall: false, label: "6 MBA Classrooms" },
          { id: "4", name: "Floor 4", count: 6, capPerRoom: 50, isHall: false, label: "6 Finance Seminars" },
        ],
        totalRooms: 26,
        totalSeats: 2000,
      },
      {
        id: "biz-law",
        name: "Law & Governance Center",
        code: "LAW",
        floors: [
          { id: "1", name: "Floor 1", count: 4, capPerRoom: 60, isHall: false, label: "4 Moot Courtrooms" },
          { id: "2", name: "Floor 2", count: 5, capPerRoom: 40, isHall: false, label: "5 Law Classrooms" },
          { id: "3", name: "Floor 3", count: 5, capPerRoom: 30, isHall: false, label: "5 Legal Seminars" },
        ],
        totalRooms: 14,
        totalSeats: 590,
      },
    ],
  },
  life: {
    name: "Health Sciences & Life Quad",
    short: "Life Sciences",
    buildings: [
      {
        id: "life-stanley",
        name: "Stanley Hall (Bioengineering)",
        code: "STAN",
        floors: [
          { id: "1", name: "Floor 1", count: 4, capPerRoom: 55, isHall: false, label: "4 Bioeng Labs" },
          { id: "2", name: "Floor 2", count: 4, capPerRoom: 45, isHall: false, label: "4 Biotech Rooms" },
          { id: "3", name: "Floor 3", count: 5, capPerRoom: 40, isHall: false, label: "5 Genetics Labs" },
          { id: "4", name: "Floor 4", count: 5, capPerRoom: 35, isHall: false, label: "5 Wet Labs" },
          { id: "5", name: "Floor 5", count: 4, capPerRoom: 30, isHall: false, label: "4 Seminars" },
          { id: "6", name: "Floor 6", count: 4, capPerRoom: 30, isHall: false, label: "4 Research Rooms" },
        ],
        totalRooms: 26,
        totalSeats: 1045,
      },
      {
        id: "life-vlsb",
        name: "Valley Life Sciences Building",
        code: "VLSB",
        floors: [
          { id: "g", name: "Ground Floor", count: 2, capPerRoom: 400, isHall: true, label: "2 Bio Demonstrator Auds" },
          { id: "1", name: "Floor 1", count: 8, capPerRoom: 40, isHall: false, label: "8 Classrooms" },
          { id: "2", name: "Floor 2", count: 8, capPerRoom: 35, isHall: false, label: "8 Bio Labs" },
          { id: "3", name: "Floor 3", count: 8, capPerRoom: 35, isHall: false, label: "8 Anat Labs" },
          { id: "4", name: "Floor 4", count: 8, capPerRoom: 30, isHall: false, label: "8 Seminars" },
        ],
        totalRooms: 34,
        totalSeats: 1940,
      },
    ],
  },
};

export const CAMPUS_ORDER = ["main", "eng", "biz", "life"] as const;

export const WEEK_OPTIONS = [
  ["1", "Week 1 — Orientation & Term Start"],
  ["3", "Week 3 — Regular Term (Labor Day Tue Swap)"],
  ["6", "Week 6 — Midterm Examinations"],
  ["9", "Week 9 — Spring Recess (Campus Closed)"],
  ["15", "Week 15 — FINAL EXAM MATRIX OVERRIDE"],
] as const;

export const DAY_OPTIONS = [
  ["mon", "Monday (Full Regular Schedule)"],
  ["tue", "Tuesday (Full Regular Schedule)"],
  ["wed", "Wednesday (14:00 Senate Blackout)"],
  ["thu", "Thursday (14:00 Dept Blackout)"],
  ["fri", "Friday (Regular Schedule)"],
] as const;

export type Week = string;
export type Day = "mon" | "tue" | "wed" | "thu" | "fri";

export interface RoomState {
  count: number;
  percent: number;
  course: string;
  prof: string;
  isBlackout: boolean;
}

// The matrix can be driven by the design's procedural model or by the live
// placed timetable. Both resolve a cell to the same RoomState shape.
export type RoomStateResolver = (
  buildingId: string,
  week: Week,
  day: Day,
  slotId: number,
  floorId: string,
  roomIndex: number,
  capPerRoom: number,
  isHall: boolean
) => RoomState;

// Procedural occupancy generator (ported 1:1 from the design reference).
export function generateRoomData(
  buildingId: string,
  week: Week,
  day: Day,
  slotId: number,
  floorId: string,
  roomIndex: number,
  capPerRoom: number,
  isHall: boolean
): RoomState {
  if (week === "9") {
    return { count: 0, percent: 0, course: "SPRING RECESS (CLOSED)", prof: "N/A", isBlackout: false };
  }
  if (slotId === 3) {
    return { count: 0, percent: 0, course: "MIDDAY LUNCH RECESS", prof: "N/A", isBlackout: false };
  }
  if (slotId === 4 && (day === "wed" || day === "thu")) {
    const label = day === "wed" ? "FACULTY SENATE ASSEMBLY" : "DEPT GOVERNANCE BLOCK";
    return { count: 0, percent: 0, course: label, prof: "ALL FACULTY", isBlackout: true };
  }
  if (week === "15") {
    const seed = (parseInt(week) * 7 + day.charCodeAt(0) + slotId * 3 + roomIndex * 5) % 100;
    let pct = 45 + (seed % 48);
    if (slotId === 6) pct = 25;
    const count = Math.round((pct / 100) * capPerRoom);
    return { count, percent: pct, course: `FINAL EXAM #${101 + roomIndex}`, prof: "Exam Proctor", isBlackout: false };
  }

  let basePct = 74;
  if (slotId === 0) basePct = 62;
  if (slotId === 1) basePct = 92;
  if (slotId === 2) basePct = 82;
  if (slotId === 4) basePct = 78;
  if (slotId === 5) basePct = 54;
  if (slotId === 6) basePct = 32;

  if (isHall) {
    if (slotId === 1) basePct = 58;
    else if (slotId === 0 || slotId === 2) basePct = 42;
    else if (slotId === 4) basePct = 36;
    else basePct = 28;
  }

  const roomSeed =
    (roomIndex * 17 + buildingId.charCodeAt(0) + (floorId === "g" ? 5 : (parseInt(floorId) || 1) * 11)) % 21;
  const finalPct = Math.min(98, Math.max(18, basePct + (roomSeed - 10)));
  const count = Math.round((finalPct / 100) * capPerRoom);

  const courses = [
    "CS 61A Structure & Interpretation",
    "MATH 53 Multivariable Calc",
    "PHYS 7A Physics for Scientists",
    "CHEM 1A General Chemistry",
    "CS 170 Efficient Algorithms",
    "ECON 100A Microeconomics",
    "EECS 16A Linear Alg & Circuits",
    "ME C85 Statics",
    "UGBA 101A Microeconomic Analysis",
    "BIO 1B Introductory Biology",
  ];
  const profs = [
    "Prof. J. DeNero",
    "Dr. E. Nelson",
    "Dr. C. LeConte",
    "Dr. M. Vance",
    "Prof. S. Russell",
    "Dr. A. Yellen",
    "Prof. L. El Ghaoui",
  ];

  return {
    count,
    percent: finalPct,
    course: courses[(roomIndex + slotId) % courses.length],
    prof: profs[(roomIndex + slotId) % profs.length],
    isBlackout: false,
  };
}

export const HEAT_CLASS = {
  vacant: "bg-emerald-100 text-emerald-950 border-emerald-300 hover:border-emerald-500 font-bold",
  moderate: "bg-sky-100 text-sky-950 border-sky-300 hover:border-sky-500 font-bold",
  high: "bg-amber-100 text-amber-950 border-amber-300 hover:border-amber-500 font-bold",
  peak: "bg-rose-100 text-rose-950 border-rose-300 hover:border-rose-500 font-bold shadow-xs",
  blackout: "pattern-blackout text-purple-950 border-purple-300 font-bold",
};

export function heatClass(percent: number, isBlackout = false): string {
  if (isBlackout) return HEAT_CLASS.blackout;
  if (percent < 40) return HEAT_CLASS.vacant;
  if (percent <= 75) return HEAT_CLASS.moderate;
  if (percent <= 90) return HEAT_CLASS.high;
  return HEAT_CLASS.peak;
}

export interface ActiveBuilding {
  campusId: string;
  campusName: string;
  building: Building;
}

export function activeBuildings(
  campus: string,
  building: string,
  campuses: Record<string, Campus> = CAMPUSES,
  order: readonly string[] = CAMPUS_ORDER
): ActiveBuilding[] {
  const list: ActiveBuilding[] = [];
  order.forEach((campusId) => {
    if (campus !== "all" && campus !== campusId) return;
    campuses[campusId]?.buildings.forEach((b) => {
      if (building !== "all" && building !== b.id) return;
      list.push({ campusId, campusName: campuses[campusId].name, building: b });
    });
  });
  return list;
}

export interface SlotAggregate {
  count: number;
  percent: number;
  isBlackout: boolean;
}

export function buildingSlot(
  b: Building,
  week: Week,
  day: Day,
  slotId: number,
  resolve: RoomStateResolver = generateRoomData
): SlotAggregate {
  let count = 0;
  let isBlackout = false;
  b.floors.forEach((floor) => {
    for (let r = 0; r < floor.count; r++) {
      const res = resolve(b.id, week, day, slotId, floor.id, r, floor.capPerRoom, floor.isHall);
      count += res.count;
      if (res.isBlackout) isBlackout = true;
    }
  });
  return {
    count,
    percent: isBlackout ? 0 : Math.round((count / Math.max(1, b.totalSeats)) * 100),
    isBlackout,
  };
}

export interface MatrixSummary {
  rows: { item: ActiveBuilding; slots: SlotAggregate[]; average: number }[];
  utilization: number;
  students: number;
  seats: number;
  busiestName: string;
  busiestPercent: number;
}

export function summarizeMatrix(
  list: ActiveBuilding[],
  week: Week,
  day: Day,
  resolve: RoomStateResolver = generateRoomData,
  slotList: Slot[] = SLOTS
): MatrixSummary {
  let grandStudents = 0;
  let grandSeats = 0;
  let busiestName = "Haas Business";
  let busiestPercent = 0;

  const rows = list.map((item) => {
    const slots = slotList.map((slot) => buildingSlot(item.building, week, day, slot.id, resolve));
    grandSeats += item.building.totalSeats;
    grandStudents += slots[1].count;

    let sum = 0;
    let active = 0;
    slots.forEach((agg, index) => {
      if (!agg.isBlackout && index !== 3) {
        sum += agg.percent;
        active += 1;
      }
    });
    const average = active > 0 ? Math.round(sum / active) : 0;
    if (average > busiestPercent) {
      busiestPercent = average;
      busiestName = item.building.name;
    }
    return { item, slots, average };
  });

  return {
    rows,
    utilization: grandSeats > 0 ? Math.round((grandStudents / grandSeats) * 100) : 0,
    students: grandStudents,
    seats: grandSeats,
    busiestName,
    busiestPercent,
  };
}

export function policyMessage(week: Week, day: Day): string {
  if (week === "9") return "Spring Recess (Closed)";
  if (week === "15") return "Week 15 Exam Matrix Active";
  if (day === "wed") return "Wed 14:00 Senate Blackout";
  if (day === "thu") return "Thu 14:00 Dept Blackout";
  return "Mon/Tue Full Schedule";
}

export function roomName(floor: Floor, index: number): string {
  return floor.isHall
    ? `Aud ${String.fromCharCode(65 + index)}`
    : `Room ${floor.id}${index < 9 ? `0${index + 1}` : index + 1}`;
}
