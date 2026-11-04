import { forwardAuth } from "@/lib/backend";

// Load the department-scale scenario (26 instructors / 25 sections / 12 cohorts) on the backend — the one-click scale proof.
// Scenario mutation requires the coordinator role, so the caller's token
// must be forwarded — without it the backend answers 401.
export async function POST(request: Request) {
  return forwardAuth(request, "/scenario/department", "POST");
}
