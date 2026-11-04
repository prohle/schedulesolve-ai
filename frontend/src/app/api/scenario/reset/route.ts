import { forwardAuth } from "@/lib/backend";

// Return to the story seed.
// Scenario mutation requires the coordinator role, so the caller's token
// must be forwarded — without it the backend answers 401.
export async function POST(request: Request) {
  return forwardAuth(request, "/scenario/reset", "POST");
}
