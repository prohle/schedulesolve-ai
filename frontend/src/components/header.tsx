"use client";

// Compact glass header: brand, live scale, role preview, user.
// Detail hides in tooltips; the preview control lets a coordinator walk the
// instructor and student experience without signing out.

import { useEffect, useRef, useState } from "react";
import {
  BookOpenCheck,
  ChevronDown,
  Eye,
  GraduationCap,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Scenario } from "@/types";
import type { AuthUser } from "@/lib/auth";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

export type PreviewRole = "instructor" | "student";

function isSampleScenario(name: string | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes("cs department") || lower.includes("university —");
}

export function Header({
  user,
  onLogout,
  previewRole,
  onPreview,
}: {
  user?: AuthUser | null;
  onLogout?: () => void;
  previewRole?: PreviewRole | null;
  onPreview?: (role: PreviewRole | null) => void;
}) {
  const [sc, setSc] = useState<Scenario | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!previewOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setPreviewOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [previewOpen]);

  const sample = isSampleScenario(sc?.name);
  const canPreview = user?.role === "coordinator" && Boolean(onPreview);

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
              <Tip label="Every timetable is solver-proven — the AI proposes, the solver verifies. No guesswork." side="bottom">
                <span className="hidden cursor-help items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200/70 min-[420px]:inline-flex">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  solver-proven
                </span>
              </Tip>
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Powered by Meta Muse Spark
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {previewRole && (
            <button
              onClick={() => onPreview?.(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-violet-600 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98]"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exit preview</span>
              <span className="sm:hidden">Exit</span>
            </button>
          )}

          {sc && (
            <Tip
              label={`${sc.name} — ${sc.instructors.length} instructors · ${sc.sections.length} sections · ${sc.cohorts.length} cohorts · ${sc.programs?.length ?? 1} programs · ${sc.rooms.length} rooms`}
              side="bottom"
            >
              <span className="hidden h-8 cursor-help items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-foreground ring-1 ring-border md:inline-flex">
                {sample && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-black uppercase tracking-wide text-amber-800">
                    Sample
                  </span>
                )}
                {sc.instructors.length} faculty · {sc.sections.length} sections
              </span>
            </Tip>
          )}

          {canPreview && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setPreviewOpen((value) => !value)}
                aria-expanded={previewOpen}
                aria-haspopup="menu"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ring-1 transition-all active:scale-[0.98]",
                  previewRole
                    ? "bg-violet-50 text-violet-700 ring-violet-200"
                    : "text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
                )}
              >
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Preview</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {previewOpen && (
                <div
                  role="menu"
                  aria-label="Preview a role"
                  className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl"
                >
                  <p className="px-2 py-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Walk their experience
                  </p>
                  {([
                    ["instructor", "Instructor", "Their timetable, workload and intake"],
                    ["student", "Student", "Their cohort timetable and advising"],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      role="menuitem"
                      onClick={() => { onPreview?.(value); setPreviewOpen(false); }}
                      className={cn(
                        "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent",
                        previewRole === value && "bg-accent"
                      )}
                    >
                      <span className="text-xs font-bold text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                  {previewRole && (
                    <button
                      role="menuitem"
                      onClick={() => { onPreview?.(null); setPreviewOpen(false); }}
                      className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-accent"
                    >
                      <X className="h-3.5 w-3.5" /> Back to coordinator
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {user && (
            <>
              <span className={cn(
                "hidden h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ring-1 sm:inline-flex",
                previewRole
                  ? "bg-violet-50 text-violet-700 ring-violet-200"
                  : "bg-blue-50 text-blue-700 ring-blue-200/70"
              )}>
                {previewRole === "instructor" ? <BookOpenCheck className="h-3.5 w-3.5" />
                  : previewRole === "student" ? <GraduationCap className="h-3.5 w-3.5" />
                  : user.role === "coordinator" ? <ShieldCheck className="h-3.5 w-3.5" />
                  : user.role === "instructor" ? <BookOpenCheck className="h-3.5 w-3.5" />
                  : <GraduationCap className="h-3.5 w-3.5" />}
                <span className="capitalize">{previewRole ?? user.role}</span>
                {previewRole && <span className="text-xs font-medium opacity-70">preview</span>}
              </span>
              <Tip label={`${user.email} · ${user.role}`} side="bottom">
                <span className="flex h-8 w-8 cursor-help items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-violet-500 text-xs font-extrabold text-white shadow-sm">
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
