import { forwardAuth } from "@/lib/backend";

// Committing a proposal mutates the term, so the coordinator token is forwarded.
export async function POST(request: Request) {
  return forwardAuth(request, "/apply", "POST", await request.text());
}
