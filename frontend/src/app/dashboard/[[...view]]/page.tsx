"use client";

// Every workspace owns a real URL: /dashboard/express, /dashboard/people,
// /dashboard/solver, … The optional catch-all keeps /dashboard working as the
// role home while letting the shell read the current workspace from the path.

import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";

function ShellFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      Loading…
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Dashboard />
    </Suspense>
  );
}
