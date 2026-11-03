import { forward } from "@/lib/backend";

// Load the Northgate institution — the comprehensive campus (148 instructors /
// 271 sections / 110 cohorts / 2,983 students across 14 buildings), where both
// engines prove the same optimum.
export async function POST() {
  return forward("/scenario/northgate", { method: "POST" });
}
