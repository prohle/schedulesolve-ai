"use client";

// Solver Lab (route view: "solver").
//
// Shows the actual native C++17 search core, the exact input model it
// receives, the head-to-head race against OR-Tools CP-SAT, and an
// independently-derived constraint proof grouped the way a coordinator
// thinks: faculty, cohorts, students, facilities, campus. Nothing on this
// screen is a claim the solver makes about itself — every check is
// re-derived from the scenario + placements by the verifier.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleSlash,
  Code2,
  Cpu,
  Download,
  GraduationCap,
  Loader2,
  Play,
  ShieldCheck,
  Timer,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tip";
import { DAY_NAMES, PERIOD_NAMES } from "@/types";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  status: "pass" | "warn" | "fail";
  detail: string;
}
interface Group {
  id: string;
  label: string;
  blurb: string;
  checks: Check[];
  passed: number;
  total: number;
  ok: boolean;
  failed: number;
  warned: number;
}
interface Proof {
  scale: string;
  engine: string;
  status: string;
  objective: number | null;
  solve_time_ms: number;
  input: Record<string, number | string>;
  race: {
    ours: { status: string; objective: number | null; solve_time_ms: number };
    cpsat: { status: string; objective: number | null; solve_time_ms: number };
    winner: string | null;
    verdict: string | null;
  };
  proof: { groups: Group[]; violations: string[]; all_ok: boolean };
  placements: {
    section_id: string;
    course_code: string;
    instructor: string;
    room: string;
    days: number[];
    periods: number[];
    period: number | null;
  }[];
}
interface Source {
  file: string;
  path: string;
  language: string;
  lines: number;
  bytes: number;
  sha256: string;
  code: string;
  files: { path: string; label: string }[];
}

const GROUP_ICON: Record<string, typeof Users> = {
  faculty: Users,
  cohorts: GraduationCap,
  students: Users,
  facilities: Building2,
  campus: Zap,
  audit: ShieldCheck,
};

const KEYWORDS = new Set([
  "struct", "class", "const", "auto", "for", "while", "if", "else", "return",
  "bool", "int", "long", "void", "static", "inline", "using", "namespace",
  "template", "typename", "true", "false", "nullptr", "char", "double",
  "unsigned", "size_t", "vector", "string", "pair", "enum", "switch", "case",
  "break", "continue", "explicit", "operator", "this",
]);

function CodeLine({ line }: { line: string }) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//")) {
    return <span className="text-slate-500 italic">{line}</span>;
  }
  // Tokenise just enough for a readable code panel: strings, comments and
  // keywords. Everything is rendered as text by React (no HTML injection).
  const parts: React.ReactNode[] = [];
  const pattern = /("(?:[^"\\]|\\.)*")|(\/\/.*$)|([A-Za-z_][A-Za-z0-9_]*)|(\d+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const [token, str, comment, word, num] = match;
    if (str) parts.push(<span key={key++} className="text-amber-300">{token}</span>);
    else if (comment) parts.push(<span key={key++} className="text-slate-500 italic">{token}</span>);
    else if (word && KEYWORDS.has(word)) parts.push(<span key={key++} className="text-violet-300">{token}</span>);
    else if (num) parts.push(<span key={key++} className="text-cyan-300">{token}</span>);
    else parts.push(token);
    last = match.index + token.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return <>{parts}</>;
}

function slotLabel(p: Proof["placements"][number]): string {
  const days = p.days.map((d) => DAY_NAMES[d]?.slice(0, 3) ?? d).join("/");
  const start = p.period != null ? PERIOD_NAMES[p.period] : PERIOD_NAMES[p.periods[0] ?? 0];
  const endIndex = p.period != null ? p.period + 1 : Math.max(...p.periods) + 1;
  const end = PERIOD_NAMES[endIndex] ?? "14:00";
  return `${days} ${start}–${end}`;
}

export function SolverLabView() {
  const [proof, setProof] = useState<Proof | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceFile, setSourceFile] = useState("native/schedulesolve_solver.cpp");
  const [scale, setScale] = useState("department");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSource = useCallback(async (file: string) => {
    const res = await fetch(`/api/solver/source?file=${encodeURIComponent(file)}`);
    const data = await res.json();
    if (res.ok) setSource(data as Source);
  }, []);

  const run = useCallback(async (nextScale = scale) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/solve/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scale: nextScale, engine: "ours" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Proof failed");
      setProof(data as Proof);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proof failed");
    } finally {
      setBusy(false);
    }
  }, [scale]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadSource(sourceFile);
    void run("department");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codeLines = useMemo(() => source?.code.split("\n") ?? [], [source]);
  const totalChecks = proof?.proof.groups.reduce((n, g) => n + g.total, 0) ?? 0;
  const passedChecks = proof?.proof.groups.reduce((n, g) => n + g.passed, 0) ?? 0;

  // A portable artifact: the exact race, proof and placements a coordinator
  // (or judge) can keep, diff, or hand to an accreditation review.
  const downloadProof = useCallback(() => {
    if (!proof) return;
    const pack = {
      generated_at: new Date().toISOString(),
      scale,
      engine: "C-Solve (native C++17)",
      source: source ? {
        file: source.file, sha256: source.sha256, lines: source.lines, bytes: source.bytes,
      } : null,
      input: proof.input,
      race: proof.race,
      proof: proof.proof,
      objective: proof.objective,
      solve_time_ms: proof.solve_time_ms,
      placements: proof.placements,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedulesolve-proof-${scale}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [proof, scale, source]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
Proof Lab
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 text-lg font-black tracking-tight">
            <Cpu className="h-5 w-5 text-primary" />
            A proven timetable — speed, evidence, audit
            <InfoTip text="The native C++17 search core races OR-Tools CP-SAT on identical data. A separate verifier re-derives every hard constraint, so the timetable is proven admissible for faculty, cohorts, students, facilities and campus — not just “solved”." />
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["department", "Department"],
            ["university", "University"],
            ["seed", "Baseline"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setScale(id); void run(id); }}
              disabled={busy}
              className={cn(
                "min-h-9 rounded-xl border px-3 text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50",
                scale === id
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
          <button
            onClick={downloadProof}
            disabled={!proof}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold transition-all hover:bg-accent active:scale-[0.98] disabled:opacity-50"
            title="Download the race, constraint proof, input model and solver-proven placements as JSON"
          >
            <Download className="h-3.5 w-3.5" /> Proof JSON
          </button>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {busy ? "Proving…" : "Run proof"}
          </button>
        </div>
      </div>

      {/* Provenance strip: which layer owns which claim. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">Muse Spark · proposes constraints</span>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">C-Solve / CP-SAT · prove placements</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Independent verifier · re-derives every hard rule</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {proof && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="elev rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-900">
                  <Timer className="h-4 w-4" /> Head-to-head · identical data
                </h3>
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">
                  {proof.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  { id: "ours", name: "C-Solve", hint: "ScheduleSolve native C++17 search core, written during the hackathon.", tone: "border-emerald-400 bg-white" },
                  { id: "cpsat", name: "CP-SAT", hint: "Google OR-Tools CP-SAT — the industrial constraint solver baseline.", tone: "border-border bg-white" },
                ].map((engine) => {
                  const row = proof.race[engine.id as "ours" | "cpsat"];
                  const first = proof.race.winner === engine.id;
                  return (
                    <div key={engine.id} className={cn("rounded-xl border p-3", engine.tone)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-extrabold">
                          {engine.name}
                          <InfoTip text={engine.hint} />
                        </span>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-black uppercase",
                          first ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground",
                        )}>
                          {first ? "Rank 1" : "Rank 2"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black tabular-nums">{row.solve_time_ms}<span className="text-xs font-bold text-muted-foreground"> ms</span></span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {row.status} · penalty {row.objective ?? "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-semibold text-emerald-900">{proof.race.verdict}</p>
            </section>

            <section className="elev rounded-2xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                <Zap className="h-4 w-4 text-primary" /> Input model
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["Faculty", proof.input.faculty],
                  ["Sections", proof.input.sections],
                  ["Rooms", proof.input.rooms],
                  ["Buildings", proof.input.buildings],
                  ["Cohorts", proof.input.cohorts],
                  ["Students", proof.input.students],
                  ["Courses", proof.input.courses],
                  ["Walk limit", `${proof.input.walk_limit_min} min`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border bg-background px-2.5 py-1.5">
                    <div className="text-sm font-black tabular-nums">{value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 truncate text-xs font-medium text-muted-foreground" title={String(proof.input.name)}>
                {proof.input.name}
              </p>
            </section>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="elev overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2">
                <Code2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-black text-slate-100">
                  {source?.file ?? "schedulesolve_solver.cpp"}
                </span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                  {source?.language ?? "C++17"}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {source?.lines ?? 0} lines · {source ? Math.round(source.bytes / 1024) : 0} KB · sha {source?.sha256.slice(0, 10)}
                </span>
                <div className="ml-auto flex gap-1">
                  {[
                    ["native/schedulesolve_solver.cpp", "solver.cpp"],
                    ["app/solver/native_solver.py", "bridge.py"],
                  ].map(([path, label]) => (
                    <button
                      key={path}
                      onClick={() => { setSourceFile(path); void loadSource(path); }}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors",
                        sourceFile === path ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="custom-scrollbar h-[430px] overflow-auto" id="solver-code-scroll">
                <pre className="min-w-full p-3 font-mono text-xs leading-[1.55] text-slate-200">
                  {codeLines.map((line, i) => (
                    <div key={i} className="flex hover:bg-white/5">
                      <span className="w-9 shrink-0 select-none pr-2 text-right text-slate-600">{i + 1}</span>
                      <code className="whitespace-pre"><CodeLine line={line} /></code>
                    </div>
                  ))}
                </pre>
              </div>
              <div className="border-t border-slate-800 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold text-slate-400">
                greedy descent → hill-climb → branch-and-bound · deterministic · single thread · JSON in / JSON out
              </div>
            </section>

            <section className="elev rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Constraint proof
                </h3>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wider",
                  proof.proof.all_ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900",
                )}>
                  {passedChecks}/{totalChecks} checks pass
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {proof.proof.groups.map((group) => {
                  const Icon = GROUP_ICON[group.id] ?? ShieldCheck;
                  return (
                    <div key={group.id} className={cn(
                      "rounded-xl border p-2.5",
                      group.ok ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/50",
                    )}>
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn("h-3.5 w-3.5", group.ok ? "text-emerald-600" : "text-amber-600")} />
                        <span className="text-xs font-extrabold">{group.label}</span>
                        <span className="ml-auto text-[10px] font-black text-muted-foreground">
                          {group.passed}/{group.total}
                        </span>
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {group.checks.map((check) => (
                          <li key={check.id} className="flex items-start gap-1.5 text-xs leading-snug">
                            {check.status === "pass" ? (
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                            ) : check.status === "warn" ? (
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                            ) : (
                              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
                            )}
                            <span className="min-w-0">
                              <span className="font-bold">{check.label}</span>
                              <span className="text-muted-foreground"> — {check.detail}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="elev rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                <GraduationCap className="h-4 w-4 text-primary" /> Result — the proven timetable
              </h3>
              <span className="text-xs font-bold text-muted-foreground">
                {proof.placements.length} sections · objective {proof.objective ?? "—"} · {proof.solve_time_ms} ms
              </span>
            </div>
            <div className="custom-scrollbar mt-2 max-h-[260px] overflow-auto rounded-xl border border-border" id="solver-result-scroll">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 text-[10px] font-black uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-2.5 py-1.5">Course</th>
                    <th className="px-2.5 py-1.5">Faculty</th>
                    <th className="px-2.5 py-1.5">Facility</th>
                    <th className="px-2.5 py-1.5">Day &amp; time</th>
                    <th className="px-2.5 py-1.5">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {proof.placements.map((p) => (
                    <tr key={p.section_id} className="border-t border-border/70 hover:bg-accent/40">
                      <td className="px-2.5 py-1.5 font-extrabold">{p.course_code}</td>
                      <td className="px-2.5 py-1.5">{p.instructor}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{p.room}</td>
                      <td className="px-2.5 py-1.5 font-semibold">{slotLabel(p)}</td>
                      <td className="px-2.5 py-1.5">
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                          solver-proven
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!proof.proof.all_ok && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {proof.proof.violations.length
                  ? proof.proof.violations.slice(0, 4).join(" · ")
                  : "Some groups report warnings — review the amber checks above."}
              </span>
            </div>
          )}
        </>
      )}

      {!proof && !busy && !error && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          Run the proof to inspect the native engine.
        </div>
      )}
    </div>
  );
}
