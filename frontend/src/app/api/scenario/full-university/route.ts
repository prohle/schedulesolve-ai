import { forwardAuth } from "@/lib/backend";

// Load the full-university stress scale (198 instructors / 361 sections).
// Scenario mutation requires the coordinator role, so the caller's token
// must be forwarded — without it the backend answers 401.
export async function POST(request: Request) {
  return forwardAuth(request, "/scenario/full-university", "POST");
}
