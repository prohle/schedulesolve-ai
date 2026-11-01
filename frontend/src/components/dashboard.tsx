"use client";

// App shell: login gate + role-aware views.
// Desktop gets an icon rail; mobile gets a bottom tab bar. No banner copy —
// each view carries its own compact header.

import { useEffect, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { Header } from "./header";
import { Sidebar, MobileNav, type ActiveView } from "./sidebar";
import { WizardView } from "./views/wizard";
import { DeliverablesView } from "./views/deliverables";
import { TermSetupView } from "./views/term-setup";
import { IntelligenceView } from "./views/intelligence";
import { LoginView } from "./views/login";
import { MyScheduleView } from "./views/my-schedule";
import { authFetch, clearSession, getStoredUser, type AuthUser } from "@/lib/auth";

export function Dashboard() {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!stored) { setAuthReady(true); return; }
    authFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const me = (await res.json()).user as AuthUser;
          setUser(me);
          setActiveView("schedule");
        } else {
          clearSession();
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);

  function handleLogin(next: AuthUser) {
    setUser(next);
    setActiveView("schedule");
  }

  async function handleLogout() {
    try { await authFetch("/api/auth/logout", { method: "POST" }); } catch { /* local clear still applies */ }
    clearSession();
    setUser(null);
    showToast("Signed out", "info");
  }

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading…
      </div>
    );
  }
  if (!user) {
    return (
      <>
        <LoginView onLogin={handleLogin} onToast={showToast} />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-foreground no-select">
      <Header user={user} onLogout={handleLogout} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
        <main className="relative min-w-0 flex-1 overflow-hidden bg-muted/30 bg-[radial-gradient(54rem_26rem_at_85%_-10%,rgba(37,99,235,0.08),transparent),radial-gradient(36rem_20rem_at_-10%_110%,rgba(124,58,237,0.06),transparent),radial-gradient(40rem_24rem_at_50%_115%,rgba(16,185,129,0.05),transparent)]">
          {/* Clearance for the fixed mobile tab bar (removed on lg). */}
          <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:p-4 lg:pb-4">
            <div key={activeView} className="animate-rise mx-auto w-full max-w-6xl">
              {activeView === "setup" && <TermSetupView user={user} onToast={showToast} />}
              {activeView === "wizard" && <WizardView onToast={showToast} />}
              {activeView === "deliverables" && (
                <DeliverablesView
                  user={user}
                  onToast={showToast}
                  onOpenFull={() => setActiveView("intelligence")}
                />
              )}
              {activeView === "schedule" && <MyScheduleView user={user} onToast={showToast} />}
              {activeView === "intelligence" && <IntelligenceView onToast={showToast} />}
            </div>
          </div>
        </main>
      </div>
      <MobileNav activeView={activeView} setActiveView={setActiveView} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
