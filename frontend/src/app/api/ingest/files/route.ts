import { forward } from "@/lib/backend";

// Multipart upload: forward the caller's token alongside the FormData body.
export async function POST(request: Request) {
  const form = await request.formData();
  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  return forward("/ingest/files", { method: "POST", headers, body: form });
}
