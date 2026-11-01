// Live campus model for the calendar matrix.
//
// The design (local-design/calendar-matrix-campus.html) groups rooms by
// building and floor. The institution model only knows building + room, so we
// group each building's rooms by room type into "floors" and resolve every
// matrix cell from the placed timetable (day + period + room), not from the
// design's procedural generator.

import type { Placement, Scenario } from "@/types";
import type {
  Campus,
  Day,
  RoomState,
  RoomStateResolver,
  Slot,
  Week,
} from "@/components/landing/campus-data";
import { SLOTS } from "@/components/landing/campus-data";

export interface LiveCampus {
  campuses: Record<string, Campus>;
  order: string[];
  slots: Slot[];
  resolve: RoomStateResolver;
  roomName: (buildingId: string, floorId: string, roomIndex: number) => string;
  stats: { buildings: number; rooms: number; seats: number };
  term: string;
}

const DAY_INDEX: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

// Design slot id -> backend period. The design's 13:00 recess has no period;
// evening slots (16:00, 18:00) do not exist in the institution model.
const SLOT_PERIOD: Record<number, number | undefined> = {
  0: 0, // 08:30 – 10:00  -> 8:00
  1: 1, // 10:00 – 11:30  -> 9:30
  2: 2, // 11:30 – 13:00  -> 11:00
  3: undefined, // lunch recess
  4: 3, // 14:00 – 15:30  -> 12:30
  5: undefined,
  6: undefined,
};

const TYPE_LABEL: Record<string, string> = {
  lecture: "Lecture",
  lab: "Laboratory",
  seminar: "Seminar",
};

export function buildLiveCampus(scenario: Scenario, placements: Placement[]): LiveCampus {
  const roomsByBuilding = new Map<string, Scenario["rooms"]>();
  scenario.rooms.forEach((room) => {
    const list = roomsByBuilding.get(room.building_id) ?? [];
    list.push(room);
    roomsByBuilding.set(room.building_id, list);
  });

  const roomsByKey = new Map<string, Scenario["rooms"][number]>();
  const courses = new Map(scenario.courses.map((course) => [course.id, course]));

  const placementsByRoom = new Map<string, Placement[]>();
  placements.forEach((placement) => {
    const list = placementsByRoom.get(placement.room_id) ?? [];
    list.push(placement);
    placementsByRoom.set(placement.room_id, list);
  });

  const buildings = scenario.buildings.map((building) => {
    const rooms = roomsByBuilding.get(building.id) ?? [];
    const byType = new Map<string, Scenario["rooms"]>();
    rooms.forEach((room) => {
      const list = byType.get(room.room_type) ?? [];
      list.push(room);
      byType.set(room.room_type, list);
    });

    const floors = [...byType.entries()].map(([roomType, typeRooms]) => {
      const capPerRoom = typeRooms.reduce((max, room) => Math.max(max, room.capacity), 0);
      typeRooms.forEach((room, index) => {
        roomsByKey.set(`${building.id}|${roomType}|${index}`, room);
      });
      const label = TYPE_LABEL[roomType] ?? roomType;
      return {
        id: roomType,
        name: `${label} floor`,
        count: typeRooms.length,
        capPerRoom,
        isHall: capPerRoom >= 100,
        label: `${typeRooms.length} ${label.toLowerCase()} room${typeRooms.length === 1 ? "" : "s"}`,
      };
    });

    return {
      id: building.id,
      name: building.name,
      code: building.id.toUpperCase(),
      floors,
      totalRooms: rooms.length,
      totalSeats: rooms.reduce((sum, room) => sum + room.capacity, 0),
    };
  });

  // Group buildings into campus quads (the model carries `campus` on each
  // building; older data defaults to Main Campus).
  const campuses: Record<string, Campus> = {};
  const order: string[] = [];
  buildings.forEach((building) => {
    const name = (scenario.buildings.find((b) => b.id === building.id)?.campus) || "Main Campus";
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "main";
    if (!campuses[id]) {
      campuses[id] = { name, short: name, buildings: [] };
      order.push(id);
    }
    campuses[id].buildings.push(building);
  });

  const resolve: RoomStateResolver = (
    buildingId: string,
    _week: Week,
    day: Day,
    slotId: number,
    floorId: string,
    roomIndex: number
  ): RoomState => {
    const vacant: RoomState = { count: 0, percent: 0, course: "VACANT", prof: "—", isBlackout: false };
    const room = roomsByKey.get(`${buildingId}|${floorId}|${roomIndex}`);
    const period = SLOT_PERIOD[slotId];
    if (!room || period === undefined) return vacant;

    const dayIndex = DAY_INDEX[day];
    const closure = scenario.closures?.find(
      (entry) => entry.day === dayIndex && (entry.period === undefined || entry.period === null || entry.period === period)
    );
    const blackout = scenario.room_blackouts.find(
      (entry) =>
        entry.room_id === room.id &&
        entry.day === dayIndex &&
        (entry.period === undefined || entry.period === null || entry.period === period)
    );
    if (closure || blackout) {
      return {
        count: 0,
        percent: 0,
        course: closure?.label ?? "INSTITUTIONAL BLACKOUT",
        prof: "—",
        isBlackout: true,
      };
    }

    const placement = placementsByRoom
      .get(room.id)
      ?.find((entry) => entry.days.includes(dayIndex) && (entry.periods ?? []).includes(period));
    if (!placement) return vacant;

    const course = courses.get(placement.course_id);
    const count = placement.enrollment ?? course?.seats ?? 0;
    return {
      count,
      percent: room.capacity > 0 ? Math.min(100, Math.round((100 * count) / room.capacity)) : 0,
      course: `${placement.course_code} ${course?.title ?? ""}`.trim(),
      prof: placement.instructor_name,
      isBlackout: false,
    };
  };

  const roomName = (buildingId: string, floorId: string, roomIndex: number) =>
    roomsByKey.get(`${buildingId}|${floorId}|${roomIndex}`)?.name ?? `Room ${roomIndex + 1}`;

  return {
    campuses,
    order,
    slots: SLOTS,
    resolve,
    roomName,
    stats: {
      buildings: buildings.length,
      rooms: scenario.rooms.length,
      seats: scenario.rooms.reduce((sum, room) => sum + room.capacity, 0),
    },
    term: scenario.name || "Live term",
  };
}
