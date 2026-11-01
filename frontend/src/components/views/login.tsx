"use client";

// Landing / first page: the institutional auth portal paired with a live
// preview of what each role receives. Matches local-design/first-page.html.
//
// Auth is real (POST /api/auth/login | /api/auth/register). The persona tabs
// pre-fill the seeded demo accounts so judges can walk in one click; everything
// to the right of the divider is a static, interactive preview.

import { useState } from "react";
import {
  BarChart2,
  BarChart3,
  Building2,
  Calendar,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  Info,
  Layers,
  Lock,
  LogIn,
  Mail,
  Settings,
  Shield,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { saveSession, type AuthUser } from "@/lib/auth";
import { AnalyticsModal } from "@/components/landing/analytics-modal";
import { HelpModal, InspectorModal } from "@/components/landing/modals";
import { PreviewColumn } from "@/components/landing/preview";
import { downloadMasterCsv } from "@/components/landing/download";
import {
  DEMO_PASSWORD,
  PERSONA_ORDER,
  PERSONAS,
  type CanvasMode,
  type Persona,
} from "@/components/landing/data";

type Toast = (message: string, type?: "info" | "success" | "warning" | "error") => void;

const NOTEBOOK_ACTIVE: Record<Persona, string> = {
  coordinator: "border-blue-200 bg-white text-blue-700",
  instructor: "border-purple-200 bg-white text-purple-700",
  student: "border-emerald-200 bg-white text-emerald-700",
};

const AVATAR_TONE: Record<Persona, string> = {
  coordinator: "bg-blue-100 text-blue-700 border-blue-200",
  instructor: "bg-purple-100 text-purple-700 border-purple-200",
  student: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function LoginView({ onLogin, onToast }: { onLogin: (user: AuthUser) => void; onToast: Toast }) {
  const [persona, setPersona] = useState<Persona>("coordinator");
  const [mode, setMode] = useState<CanvasMode>("table");
  const [email, setEmail] = useState(PERSONAS.coordinator.email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [role, setRole] = useState("instructor");
  const [linkId, setLinkId] = useState("");

  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [inspector, setInspector] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  function selectPersona(next: Persona) {
    setPersona(next);
    setEmail(PERSONAS[next].email);
    setPassword(DEMO_PASSWORD);
    setRegistering(false);
    onToast(`Pre-filled form for ${PERSONAS[next].roleTitle}`, "info");
  }

  async function submit() {
    if (!email || !password) {
      onToast("Enter an email and password to continue", "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          registering
            ? {
                email,
                password,
                role,
                instructor_id: role === "instructor" ? linkId || undefined : undefined,
                cohort_id: role === "student" ? linkId || undefined : undefined,
              }
            : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Login failed");
      saveSession(data.token, data.user);
      onToast(`Welcome, ${data.user.display_name}`, "success");
      onLogin(data.user as AuthUser);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Login failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadMasterCsv();
    onToast("Downloaded schedulesolve_master_timetable_fall2026.csv", "success");
  }

  const railItems = [
    {
      key: "home",
      label: "Workspace Home",
      icon: Home,
      onClick: () => onToast("Active Workspace: Dashboard", "info"),
    },
    {
      key: "calendar",
      label: "Timetable Matrix",
      icon: Calendar,
      onClick: () => setMode("calendar"),
    },
    {
      key: "facilities",
      label: "Facility Zone Manager",
      icon: Building2,
      onClick: () => setInspector("utilization"),
    },
    {
      key: "analytics",
      label: "Solver Analytics",
      icon: BarChart3,
      onClick: () => setAnalyticsOpen(true),
    },
    {
      key: "integrations",
      label: "SIS / ERP Sync Integrations",
      icon: Layers,
      onClick: exportCsv,
    },
  ];

  return (
    <div className="landing flex min-h-dvh flex-col justify-between bg-slate-50 text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/90 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => onToast("ScheduleSolve AI Engine v4.2 Z3 SMT Active", "info")}
            className="group flex items-center gap-3 text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-blue-200 transition-transform duration-300 group-hover:scale-105">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-lg font-black tracking-tight text-slate-900">
                  ScheduleSolve <span className="text-blue-600">AI</span>
                </span>
                <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 sm:inline">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                Powered by <span className="font-semibold text-indigo-600">Muse Spark</span>
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAnalyticsOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-bold text-blue-700 shadow-xs transition-all hover:bg-blue-100 hover:shadow-md"
            >
              <BarChart2 className="h-4 w-4" />
              <span className="hidden sm:inline">Interactive Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-grow items-stretch gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-16 shrink-0 flex-col items-center justify-between rounded-2xl border border-slate-200 bg-white px-2 py-4 shadow-ultra md:flex">
          <div className="flex w-full flex-col items-center gap-4">
            {railItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={item.onClick}
                  className={`nav-icon-link rounded-xl p-2.5 ${
                    index === 0 ? "active text-white" : "text-slate-500"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            <button
              type="button"
              title="System Settings"
              aria-label="System Settings"
              onClick={() => setHelpOpen(true)}
              className="nav-icon-link rounded-xl p-2.5 text-slate-500"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              type="button"
              title={`Signed in as ${PERSONAS[persona].displayName}`}
              onClick={() => onToast(`Active persona: ${PERSONAS[persona].displayName}`, "info")}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold shadow-xs ${AVATAR_TONE[persona]}`}
            >
              {PERSONAS[persona].initials}
            </button>
          </div>
        </aside>

        <main className="grid flex-grow grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="mx-auto flex h-full w-full max-w-md flex-col justify-between space-y-5 lg:col-span-4 lg:max-w-none lg:border-r lg:border-slate-200/90 lg:pr-8">
            <div className="flex min-h-[460px] flex-grow overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-ultra">
              <div className="flex w-16 shrink-0 select-none flex-col justify-start gap-2 border-r border-slate-200/80 bg-slate-100/90 p-1.5">
                <div className="py-1 text-center font-mono text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Tabs
                </div>

                {PERSONA_ORDER.map((id) => {
                  const config = PERSONAS[id];
                  const active = persona === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectPersona(id)}
                      title={`Pre-fill ${config.roleTitle}`}
                      className={`notebook-tab flex cursor-pointer flex-col items-center justify-center rounded-xl border px-1 py-3 transition-all ${
                        active
                          ? `${NOTEBOOK_ACTIVE[id]} font-bold shadow-xs`
                          : "border-transparent text-slate-500 hover:bg-slate-200/60"
                      }`}
                    >
                      <span className="font-mono text-xs font-black">{config.initials}</span>
                      <span className="mt-0.5 text-[9px] font-extrabold uppercase">{config.tabLabel}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-1 flex-col justify-between space-y-4 p-5 sm:p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-xs">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold tracking-tight text-slate-900">
                          {registering ? "Create Account" : "Login / Register"}
                        </h2>
                        <p className="text-[11px] font-medium text-slate-500">
                          Institutional Schedule Management
                        </p>
                      </div>
                    </div>
                  </div>

                  <form
                    className="space-y-3.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <div className="space-y-1">
                      <label htmlFor="email" className="block text-xs font-bold text-slate-700">
                        Email
                      </label>
                      <div className="relative rounded-xl shadow-xs">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          inputMode="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@university.edu"
                          className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="block text-xs font-bold text-slate-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => onToast("SSO password reset token dispatched to inbox.", "info")}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative rounded-xl shadow-xs">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <Lock className="h-4 w-4" />
                        </div>
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          required
                          autoComplete={registering ? "new-password" : "current-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="block w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-xs font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {registering && (
                      <div className="flex gap-2">
                        <select
                          aria-label="Account role"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="min-w-0 rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-medium focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="instructor">Instructor</option>
                          <option value="student">Student</option>
                          <option value="coordinator">Coordinator</option>
                        </select>
                        <input
                          aria-label="Linked instructor or cohort id"
                          value={linkId}
                          onChange={(e) => setLinkId(e.target.value)}
                          placeholder={role === "student" ? "Cohort id (cs2025)" : "Instructor id (chen)"}
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={keepSignedIn}
                          onChange={(e) => setKeepSignedIn(e.target.checked)}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-[11px] font-medium text-slate-600">Keep me signed in</span>
                      </label>
                      <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-700">
                        <Shield className="h-3 w-3 text-emerald-600" /> 256-bit AES
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-200 transition-all hover:bg-blue-700 focus:outline-none active:scale-[0.99] disabled:opacity-70"
                    >
                      {busy ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : registering ? (
                        <UserPlus className="h-3.5 w-3.5" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {busy
                          ? "Authenticating with SMT Kernel..."
                          : registering
                            ? "Create account"
                            : "Sign in to Workspace"}
                      </span>
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setRegistering((v) => !v)}
                    className="w-full text-center text-[11px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
                  >
                    {registering ? "Already have an account? Sign in" : "New here? Create an account"}
                  </button>
                </div>

                <div className="space-y-1 rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-900">
                    <Info className="h-3.5 w-3.5 text-blue-600" />
                    <span>Notebook Pre-fill Active</span>
                  </div>
                  <p className="text-[10.5px] leading-snug text-slate-500">
                    Tap vertical tabs (<strong className="text-slate-700">CO, PC, CS</strong>) on the left edge
                    to instantly populate demo credentials, then press{" "}
                    <strong className="text-slate-700">Sign in</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <PreviewColumn
              persona={persona}
              onPersonaChange={setPersona}
              mode={mode}
              onModeChange={setMode}
              onInspect={setInspector}
              onOpenAnalytics={() => setAnalyticsOpen(true)}
              onToast={(message) => onToast(message, "info")}
            />
          </div>
        </main>
      </div>

      <footer className="w-full border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">ScheduleSolve AI</span>
            <span>© 2026 Meta Hackathon - Huong Le</span>
          </div>
          <div className="flex items-center gap-4 text-slate-600">
            <button
              type="button"
              onClick={() => onToast("Displaying Privacy Policy", "info")}
              className="hover:text-blue-600"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onToast("Displaying Terms of Service", "info")}
              className="hover:text-blue-600"
            >
              Terms
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} className="hover:text-blue-600">
              prohle@gmail.com
            </button>
          </div>
        </div>
      </footer>

      {analyticsOpen && (
        <AnalyticsModal
          persona={persona}
          email={email}
          onClose={() => setAnalyticsOpen(false)}
          onToast={(message) => onToast(message, "info")}
        />
      )}
      {inspector && <InspectorModal topic={inspector} onClose={() => setInspector(null)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
