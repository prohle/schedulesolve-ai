import { forwardAuth } from "@/lib/backend";

export async function POST(request: Request) {
  return forwardAuth(request, "/intelligence/tighten/apply", "POST", await request.text());
}
