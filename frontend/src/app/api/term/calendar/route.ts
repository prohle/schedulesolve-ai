import { forwardAuth } from "@/lib/backend";

export async function GET(request: Request) {
  return forwardAuth(request, "/term/calendar", "GET");
}

export async function POST(request: Request) {
  return forwardAuth(request, "/term/calendar", "POST", await request.text());
}
