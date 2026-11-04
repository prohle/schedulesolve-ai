import { forwardAuth } from "@/lib/backend";

// Ingestion mutates the institution model, so the coordinator token is
// forwarded to the backend.
export async function POST(request: Request) {
  return forwardAuth(request, "/ingest", "POST", await request.text());
}
