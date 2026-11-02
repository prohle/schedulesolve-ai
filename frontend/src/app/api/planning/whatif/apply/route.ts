import { forwardAuth } from "@/lib/backend";

// Commit a previewed what-if change to the live institution model.
export async function POST(request: Request) {
  return forwardAuth(request, "/planning/whatif/apply", "POST", await request.text());
}
