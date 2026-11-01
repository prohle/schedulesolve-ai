import { forwardAuth } from "@/lib/backend";

export async function GET(request: Request) {
  return forwardAuth(request, "/institution/overview", "GET");
}
