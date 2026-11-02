import { forward } from "@/lib/backend";

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file") || "native/schedulesolve_solver.cpp";
  return forward(`/solver/source?file=${encodeURIComponent(file)}`, { method: "GET" });
}
