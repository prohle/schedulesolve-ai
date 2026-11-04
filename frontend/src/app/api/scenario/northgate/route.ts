import { forwardAuth } from "@/lib/backend";

// Load the whole-campus Northgate scale (148 instructors / 271 sections).
// Scenario mutation requires the coordinator role, so the caller's token
// must be forwarded — without it the backend answers 401.
export async function POST(request: Request) {
  return forwardAuth(request, "/scenario/northgate", "POST");
}
