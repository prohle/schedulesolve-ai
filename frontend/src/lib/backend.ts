// Server-side proxy to the Python backend (FastAPI + OR-Tools CP-SAT).
//
// Client components never import this file directly — they call the /api/*
// route handlers (same origin), which forward to the backend here. This keeps
// the backend URL a server-only concern and gives the UI a single stable
// /api/* contract whether or not the Python service is up.
//
// Set BACKEND_URL to override the default (e.g. BACKEND_URL=http://host:8000).

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Same-origin route handlers that need the caller's bearer token: pass the
// Authorization header through to the Python backend.
export function forwardAuth(
  request: Request,
  path: string,
  method: string,
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return forward(path, { method, headers, body });
}

export async function forward(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, init);
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      {
        error: `Backend unreachable at ${BACKEND_URL}. Start it with: cd backend && .venv/bin/uvicorn app.main:app`,
      },
      { status: 502 }
    );
  }
}