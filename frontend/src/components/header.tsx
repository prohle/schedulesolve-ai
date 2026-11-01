"use client";

// Compact glass header: brand, live scale, user. Detail hides in tooltips.

import { useEffect, useState } from "react";
import { BookOpenCheck, GraduationCap, LogOut, ShieldCheck } from "lucide-react";
import type { Scenario } from "@/types";
import type { AuthUser } from "@/lib/auth";
import { Tip } from "@/components/ui/tip";

export function Header({ user, onLogout }: { user?: AuthUser | null; onLogout?: () => void }) {
  const [sc, setSc] = useState<Scenario | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/scenario")
        .then((r) => r.json())
        .then((d) => { if (live && d && Array.isArray(d.instructors)) setSc(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <header className="glass sticky top-0 z-40 shrink-0 border-b border-border">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            width={329}
            height={237}
            className="h-7 w-auto shrink-0 object-contain"
          />
          <div className="min-w-0 leading-tight">
            <h1 className="flex items-center gap-1.5 truncate text-sm font-extrabold tracking-tight text-foreground">
              ScheduleSolve AI
              <Tip label="Every schedule is solver-proven — the AI proposes, the solver verifies. No guesswork." side="bottom">
                <span className="hidden cursor-help rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 ring-1 ring-blue-200/70 min-[420px]:inline-block">
                  solver-proven
                </span>
              </Tip>
            </h1>
            <p className="hidden truncate text-[10px] text-muted-foreground sm:block">
              Scheduling co-pilot
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {sc && (
            <Tip label={`${sc.name} — ${sc.instructors.length} instructors · ${sc.sections.length} sections · ${sc.cohorts.length} cohorts · ${sc.programs?.length ?? 1} programs · ${sc.rooms.length} rooms`} side="bottom">
              <span className="hidden h-8 cursor-help items-center rounded-full bg-muted px-2.5 text-[11px] font-medium text-foreground ring-1 ring-border md:inline-flex">
                {sc.instructors.length} faculty · {sc.sections.length} sections
              </span>
            </Tip>
          )}

          {user && (
            <>
              <span className="hidden h-8 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200/70 sm:inline-flex">
                {user.role === "coordinator" ? <ShieldCheck className="h-3.5 w-3.5" />
                  : user.role === "instructor" ? <BookOpenCheck className="h-3.5 w-3.5" />
                  : <GraduationCap className="h-3.5 w-3.5" />}
                <span className="capitalize">{user.role}</span>
              </span>
              <Tip label={`${user.email} · ${user.role}`} side="bottom">
                <span className="flex h-8 w-8 cursor-help items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-violet-500 text-[11px] font-extrabold text-white shadow-sm">
                  {(user.display_name || user.email).slice(0, 1).toUpperCase()}
                </span>
              </Tip>
              <Tip label="Sign out" side="bottom">
                <button
                  onClick={onLogout}
                  aria-label="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-all hover:bg-accent hover:text-accent-foreground active:scale-95"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </Tip>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
