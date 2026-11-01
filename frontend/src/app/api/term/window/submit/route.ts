import { forwardAuth } from "@/lib/backend";

export async function POST(request: Request) {
  return forwardAuth(request, "/term/window/submit", "POST", await request.text());
}
