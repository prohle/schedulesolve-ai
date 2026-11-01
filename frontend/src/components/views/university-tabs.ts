// Top-level university tabs. Each institution fact gets its own rail entry
// (the user asked for Facility, Map, People, … as first-class tabs, not
// nested inside one "University" screen).

import {
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Map,
  Save,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

export type UniversitySection =
  | "overview"
  | "facility"
  | "map"
  | "people"
  | "degrees"
  | "catalog"
  | "students"
  | "holidays"
  | "weeks"
  | "constraints"
  | "calendar"
  | "settings"
  | "save";

export interface UniversityTab {
  id: UniversitySection;
  label: string;
  icon: typeof Building2;
  desc: string;
}

export const UNIVERSITY_TABS: UniversityTab[] = [
  { id: "overview", label: "University", icon: ShieldCheck, desc: "University overview: load rules, term shape and campus-wide proof" },
  { id: "facility", label: "Facility", icon: Building2, desc: "Campus buildings, rooms and halls" },
  { id: "map", label: "Map", icon: Map, desc: "Campus quads and buildings at a glance" },
  { id: "people", label: "People", icon: Users, desc: "Faculty, preferences and the intake deadline" },
  { id: "degrees", label: "Degree Map", icon: GraduationCap, desc: "Majors, minors and cohort roadmaps" },
  { id: "catalog", label: "Catalog", icon: BookOpen, desc: "Course catalog: patterns, seats, equipment" },
  { id: "students", label: "Students", icon: Users, desc: "Student bodies and their term courses" },
  { id: "holidays", label: "Holidays", icon: CalendarDays, desc: "Holidays and campus closures" },
  { id: "weeks", label: "Weeks", icon: CalendarDays, desc: "Number of teaching weeks" },
  { id: "constraints", label: "Constraints", icon: AlertTriangle, desc: "Campus-wide constraints" },
  { id: "calendar", label: "Calendar", icon: CalendarRange, desc: "University term calendar" },
  { id: "settings", label: "Settings", icon: Settings, desc: "Term settings and institution updates" },
  { id: "save", label: "Save options", icon: Save, desc: "Saved schedule options" },
];

const IDS = new Set<string>(UNIVERSITY_TABS.map((tab) => tab.id));

export function isUniversitySection(view: string): view is UniversitySection {
  return IDS.has(view);
}
