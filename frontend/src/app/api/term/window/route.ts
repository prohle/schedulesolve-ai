import { forwardAuth } from "@/lib/backend";

export async function GET(request: Request) {
  return forwardAuth(request, "/term/window", "GET");
}

export async function POST(request: Request) {
  return forwardAuth(request, "/term/window", "POST", await request.text());
}
