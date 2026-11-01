import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "ScheduleSolve AI — Zero-Conflict University Timetable Infrastructure",
  description:
    "Parallel Z3 SMT and CP-SAT solver kernels for conflict-free university timetables, spatial capacity optimization and faculty workload harmony.",
};

export default function Home() {
  return <LandingPage />;
}
