import { forwardAuth } from "@/lib/backend";

// Load the university-scale scenario (38 instructors / 41 sections / 20 cohorts).
// Scenario mutation requires the coordinator role, so the caller's token
// must be forwarded — without it the backend answers 401.
export async function POST(request: Request) {
  return forwardAuth(request, "/scenario/university", "POST");
}
