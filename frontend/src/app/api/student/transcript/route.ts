import { forward } from "@/lib/backend";

export async function POST(request: Request) {
  const form = await request.formData();
  // Node fetch sets the multipart boundary automatically for a FormData body.
  return forward("/student/transcript", { method: "POST", body: form });
}
