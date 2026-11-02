import { forwardAuth } from "@/lib/backend";

export async function POST(request: Request) {
  return forwardAuth(request, "/runtime/test", "POST", "{}");
}
