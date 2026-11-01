import { forwardAuth } from "@/lib/backend";

export async function POST(request: Request) {
  return forwardAuth(request, "/term/window/options", "POST", await request.text());
}
