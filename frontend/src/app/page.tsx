import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "ScheduleSolve AI — Solver-Proven University Timetable Infrastructure",
  description:
    "Muse Spark turns messy files and plain English into typed constraints; OR-Tools CP-SAT and a native C++ solver prove every university timetable, coverage swap and student plan.",
};

export default function Home() {
  return <LandingPage />;
}
