"use client";

// App shell (route: /dashboard/[[...view]]): role-aware workspaces with real
// URLs. Desktop gets an icon rail; mobile gets a bottom tab bar. Visitors
// without a session are redirected to /login-register and returned here after
// signing in.

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { Header, type PreviewRole } from "./header";
import {
  Sidebar,
  MobileNav,
  homeView,
  isViewAllowed,
  viewFromPath,
  viewPath,
  type ActiveView,
} from "./sidebar";
import { WizardView } from "./views/wizard";
import { DeliverablesView } from "./views/deliverables";
import { TermSetupView } from "./views/term-setup";
import { isUniversitySection } from "./views/university-tabs";
import { IntelligenceView } from "./views/intelligence";
import { MyScheduleView } from "./views/my-schedule";
import { SolverLabView } from "./views/solver-lab";
import { RuntimeView } from "./views/runtime";
import { FirstRunChecklist } from "./first-run";
import { RolePreviewView } from "./role-preview";
import { authFetch, clearSession, getStoredUser, type AuthUser } from "@/lib/auth";

export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [previewRole, setPreviewRole] = useState<PreviewRole | null>(null);
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
      const intended = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login-register?next=${encodeURIComponent(intended)}`);
      return;
    }
    authFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const me = (await res.json()).user as AuthUser;
          setUser(me);
        } else {
          clearSession();
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [router]);

  // No session (or an expired one): the app shell is not the place to sign in.
  useEffect(() => {
    if (authReady && !user) {
      const intended = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      router.replace(`/login-register?next=${encodeURIComponent(intended)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, router, pathname]);

  // The URL is the source of truth. An empty /dashboard resolves to the role
  // home; a forbidden or unknown deep link also falls back to that home.
  const segment = pathname.replace(/^\/dashboard\/?/, "").split("/")[0] || undefined;
  const requested = viewFromPath(segment);
  const role = previewRole ?? user?.role ?? "coordinator";
  const home = homeView(role);
  const safeView: ActiveView =
    requested && isViewAllowed(role, requested) ? requested : home;

  useEffect(() => {
    if (!authReady || !user) return;
    if (!requested) {
      router.replace(viewPath(home));
      return;
    }
    if (!isViewAllowed(role, requested)) {
      router.replace(viewPath(home));
    }
  }, [authReady, user, requested, role, home, router]);

  async function handleLogout() {
    try { await authFetch("/api/auth/logout", { method: "POST" }); } catch { /* local clear still applies */ }
    clearSession();
    setUser(null);
    router.replace("/login-register");
  }

  function navigate(view: ActiveView) {
    router.push(viewPath(view));
  }

  function navigatePath(path: string) {
    router.push(path);
  }

  function changePreview(next: PreviewRole | null) {
    setPreviewRole(next);
    const nextRole = next ?? user?.role ?? "coordinator";
    if (!isViewAllowed(nextRole, safeView)) {
      router.push(viewPath(homeView(nextRole)));
    }
  }

  if (!authReady || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading…
      </div>
    );
  }

  const wizardStep = searchParams.get("step");

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground no-select">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header
        user={user}
        onLogout={handleLogout}
        previewRole={previewRole}
        onPreview={changePreview}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar role={role} activeView={safeView} setActiveView={navigate} />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative min-w-0 flex-1 overflow-hidden bg-muted/30"
        >
          {/* Clearance for the fixed mobile tab bar (removed on lg). */}
          <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:p-4 lg:pb-4">
            <div key={`${safeView}-${previewRole ?? "self"}`} className="animate-rise mx-auto w-full max-w-6xl">
              {previewRole ? (
                <RolePreviewView
                  role={previewRole}
                  user={user}
                  onToast={showToast}
                  onExit={() => changePreview(null)}
                />
              ) : (
                <>
                  {role === "coordinator" && safeView === "wizard" && (
                    <FirstRunChecklist onNavigate={navigatePath} />
                  )}
                  {isUniversitySection(safeView) && (
                    <TermSetupView
                      user={user}
                      onToast={showToast}
                      section={safeView}
                      onNavigate={navigate}
                    />
                  )}
                  {safeView === "wizard" && (
                    <WizardView onToast={showToast} initialStep={wizardStep} />
                  )}
                  {safeView === "deliverables" && (
                    <DeliverablesView
                      user={user}
                      onToast={showToast}
                      onOpenFull={role === "coordinator" ? () => navigate("intelligence") : undefined}
                    />
                  )}
                  {safeView === "schedule" && <MyScheduleView user={user} onToast={showToast} />}
                  {safeView === "intelligence" && <IntelligenceView onToast={showToast} />}
                  {safeView === "solver" && <SolverLabView />}
                  {safeView === "runtime" && <RuntimeView />}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
      <MobileNav role={role} activeView={safeView} setActiveView={navigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
