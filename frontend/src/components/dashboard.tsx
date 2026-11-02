"use client";

// App shell (route: /dashboard): role-aware views.
// Desktop gets an icon rail; mobile gets a bottom tab bar. No banner copy —
// each view carries its own compact header. Visitors without a session are
// redirected to /login-register.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { Header } from "./header";
import { Sidebar, MobileNav, isViewAllowed, type ActiveView } from "./sidebar";
import { WizardView } from "./views/wizard";
import { DeliverablesView } from "./views/deliverables";
import { TermSetupView } from "./views/term-setup";
import { isUniversitySection } from "./views/university-tabs";
import { IntelligenceView } from "./views/intelligence";
import { MyScheduleView } from "./views/my-schedule";
import { SolverLabView } from "./views/solver-lab";
import { RuntimeView } from "./views/runtime";
import { authFetch, clearSession, getStoredUser, type AuthUser } from "@/lib/auth";

export function Dashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ActiveView>("wizard");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  } | null>(null);

  const showToast = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login-register");
      return;
    }
    authFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const me = (await res.json()).user as AuthUser;
          setUser(me);
          // Coordinators land on the Import wizard (the demo path judges
          // follow); instructors and students land on their own schedule.
          setActiveView(me.role === "coordinator" ? "wizard" : "schedule");
        } else {
          clearSession();
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [router]);

  // No session (or an expired one): the app shell is not the place to sign in.
  useEffect(() => {
    if (authReady && !user) router.replace("/login-register");
  }, [authReady, user, router]);

  async function handleLogout() {
    try { await authFetch("/api/auth/logout", { method: "POST" }); } catch { /* local clear still applies */ }
    clearSession();
    setUser(null);
    router.replace("/login-register");
  }

  if (!authReady || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading…
      </div>
    );
  }

  // A role only sees its own rail. If a hidden view is somehow active (deep
  // state, a stale click, a role switch), fall back to the role's home view
  // instead of rendering an admin-only screen.
  const safeView: ActiveView = isViewAllowed(user.role, activeView)
    ? activeView
    : user.role === "coordinator" ? "wizard" : "schedule";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground no-select">
      <Header user={user} onLogout={handleLogout} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar role={user.role} activeView={safeView} setActiveView={setActiveView} />
        <main className="relative min-w-0 flex-1 overflow-hidden bg-muted/30 bg-[radial-gradient(54rem_26rem_at_85%_-10%,rgba(37,99,235,0.08),transparent),radial-gradient(36rem_20rem_at_-10%_110%,rgba(124,58,237,0.06),transparent),radial-gradient(40rem_24rem_at_50%_115%,rgba(16,185,129,0.05),transparent)]">
          {/* Clearance for the fixed mobile tab bar (removed on lg). */}
          <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:p-4 lg:pb-4">
            <div key={safeView} className="animate-rise mx-auto w-full max-w-6xl">
              {isUniversitySection(safeView) && (
                <TermSetupView
                  user={user}
                  onToast={showToast}
                  section={safeView}
                  onNavigate={setActiveView}
                />
              )}
              {safeView === "wizard" && <WizardView onToast={showToast} />}
              {safeView === "deliverables" && (
                <DeliverablesView
                  user={user}
                  onToast={showToast}
                  onOpenFull={user.role === "coordinator" ? () => setActiveView("intelligence") : undefined}
                />
              )}
              {safeView === "schedule" && <MyScheduleView user={user} onToast={showToast} />}
              {safeView === "intelligence" && <IntelligenceView onToast={showToast} />}
              {safeView === "solver" && <SolverLabView />}
              {safeView === "runtime" && <RuntimeView />}
            </div>
          </div>
        </main>
      </div>
      <MobileNav role={user.role} activeView={safeView} setActiveView={setActiveView} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
