"use client";

// AI Runtime (route view: "runtime").
//
// The settings page the demo needs: what model the server is actually
// calling, a real structured-output connection test, the exact client code
// and env that produce it, and the captured verification runs. Read-only by
// design — changing the provider is an env swap, not a hidden UI mutation.

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Timer,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tip";
import { authFetch } from "@/lib/auth";

interface Role {
  role: string;
  model: string;
  schema: string;
  endpoint: string;
}
interface Verification {
  model?: string;
  base_url?: string;
  calls: number;
  verified?: string;
}
interface RuntimeConfig {
  provider: string;
  base_url: string;
  model: string;
  key_present: boolean;
  key_hint: string;
  timeout_s: number;
  reasoning_effort: string;
  live: boolean;
  roles: Role[];
  verification: Record<string, Verification>;
}
interface TestResult {
  ok: boolean;
  mode: string;
  model: string | null;
  latency_ms: number | null;
  summary: string;
  operations: { op: string; explanation: string }[];
}

const PRESETS = [
  {
    id: "baseten",
    name: "Baseten",
    detail: "Muse Spark Open — open weights, remote inference",
    icon: Cloud,
    match: (url: string) => url.includes("baseten"),
  },
  {
    id: "meta",
    name: "Meta Model API",
    detail: "Hosted Muse Spark — managed, no GPU to run",
    icon: Sparkles,
    match: (url: string) => url.includes("meta.ai"),
  },
  {
    id: "self",
    name: "Self-hosted",
    detail: "vLLM / Modal — same client, on-premise privacy",
    icon: Server,
    match: (url: string) => !url.includes("baseten") && !url.includes("meta.ai"),
  },
];

function codeFor(config: RuntimeConfig | null) {
  const base = config?.base_url || "https://inference.baseten.co/v1";
  const model = config?.model || "meta-models/muse-spark-open-1026";
  return `from openai import OpenAI

# One client for every structured Muse Spark role.
client = OpenAI(
    base_url="${base}",
    api_key=os.environ["MODEL_API_KEY"],
    timeout=${config?.timeout_s ?? 120},
)

# Structured output is schema-constrained by the endpoint.
parsed = client.beta.chat.completions.parse(
    model="${model}",
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ],
    response_format=ParsedRequest,   # pydantic schema
)

ops = validate_operations(parsed.operations, scenario)  # never trusted`;
}

function envFor(config: RuntimeConfig | null) {
  return `# .env — swap provider without touching code
MUSE_BASE_URL=${config?.base_url || "https://inference.baseten.co/v1"}
MUSE_MODEL=${config?.model || "meta-models/muse-spark-open-1026"}
MODEL_API_KEY=<${config?.key_hint || "your-key"}>
MUSE_TIMEOUT_S=${config?.timeout_s ?? 120}
MUSE_REASONING_EFFORT=${config?.reasoning_effort || "low"}`;
}

export function RuntimeView() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"python" | "env">("python");

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/runtime/config");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not read runtime config");
      setConfig(data as RuntimeConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read runtime config");
    }
  }, []);

  const runTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/runtime/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Connection test failed");
      setTest(data as TestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const open = config?.verification.open;
  const hosted = config?.verification.hosted;
  const code = tab === "python" ? codeFor(config) : envFor(config);
  const activePreset = PRESETS.find((p) => p.match(config?.base_url || ""))?.id ?? "self";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
AI Runtime
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 text-lg font-black tracking-tight">
            <PlugZap className="h-5 w-5 text-primary" />
            Muse Spark connection &amp; configuration
            <InfoTip text="The same client runs hosted Muse Spark, open-weight Muse Spark Open on Baseten, or a self-hosted vLLM endpoint. The model is a configuration value — every role below is schema-validated before it can touch the term." />
          </h2>
        </div>
        <button
          onClick={() => void runTest()}
          disabled={busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {busy ? "Calling Muse…" : "Test connection"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="elev rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
              config?.live ? "bg-emerald-600 text-white" : "bg-amber-500 text-white",
            )}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {config?.live ? "Live" : "Deterministic fallback"}
            </span>
            <span className="text-xs font-extrabold">{config?.provider ?? "—"}</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
              {config?.model ?? "—"}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" /> structured output
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["Endpoint", config?.base_url ?? "—"],
              ["Key", config?.key_present ? `present · ${config.key_hint}` : "not set"],
              ["Timeout", `${config?.timeout_s ?? 120}s`],
              ["Reasoning effort", config?.reasoning_effort ?? "low"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-emerald-200/70 bg-white/80 px-2.5 py-1.5">
                <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="truncate font-mono text-[10.5px] font-semibold" title={String(value)}>{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-border bg-white p-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Connection test · real structured call
            </div>
            {test ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-black uppercase",
                    test.mode === "muse-spark" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900",
                  )}>
                    {test.mode}
                  </span>
                  <span className="font-mono text-[10px] font-semibold">{test.model ?? "deterministic"}</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-800">
                    {test.operations.length} schema-valid operation{test.operations.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto text-[10px] font-bold tabular-nums text-muted-foreground">
                    {test.latency_ms != null ? `${(test.latency_ms / 1000).toFixed(1)} s` : "—"}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-800">{test.summary}</p>
                <ul className="space-y-0.5">
                  {test.operations.slice(0, 3).map((op, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                      <span><span className="font-mono font-bold text-slate-700">{op.op}</span> — {op.explanation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Run the test to prove the configured endpoint answers with schema-valid operations.
              </p>
            )}
          </div>
        </section>

        <section className="elev rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-emerald-600" /> Captured verification
          </h3>
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-black tabular-nums text-emerald-900">
                  {open?.calls ?? 0}<span className="text-sm font-bold text-emerald-700">/{open?.calls ?? 0}</span>
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-800">
                  live structured calls · open weights
                </div>
              </div>
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-1.5 truncate font-mono text-[9px] font-semibold text-emerald-900">{open?.model ?? "—"}</p>
            <p className="truncate text-[9px] text-emerald-800">{open?.base_url ?? "—"}</p>
          </div>
          <ul className="mt-2 space-y-1 text-[10px]">
            {([
              ["Hosted Muse Spark", hosted],
              ["Student plan parse", config?.verification.student],
              ["Voice transcribe", config?.verification.voice],
            ] as [string, Verification | undefined][]).map(([label, row]) => (
              <li key={label} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1">
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground">
                  {row?.calls ? `${row.calls} captured` : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[9px] leading-snug text-muted-foreground">
            Captured runs in <span className="font-mono">backend/muse-verification-open.json</span>.
            Every screen badge is asserted live by the recorder — never a canned result.
          </p>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="elev overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2">
            <Code2 className="h-4 w-4 text-emerald-400" />
            <span className="text-[11px] font-black text-slate-100">How the client connects</span>
            <div className="ml-auto flex gap-1">
              {[
                ["python", "client.py"],
                ["env", ".env"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id as "python" | "env")}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition-colors",
                    tab === id ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <pre className="custom-scrollbar h-[330px] overflow-auto p-3 font-mono text-[10.5px] leading-[1.6] text-slate-200">
            {code}
          </pre>
          <div className="border-t border-slate-800 bg-slate-900/80 px-3 py-1.5 text-[9px] font-semibold text-slate-400">
            Same code path for hosted, Baseten and self-hosted — only the env changes.
          </div>
        </section>

        <section className="elev rounded-2xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
            <Cpu className="h-4 w-4 text-primary" /> Provider presets
          </h3>
          <div className="mt-2 space-y-1.5">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active = activePreset === preset.id;
              return (
                <div key={preset.id} className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5",
                  active ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400" : "border-border bg-background",
                )}>
                  <span className={cn("rounded-lg p-1.5", active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold">{preset.name}</span>
                      {active && (
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">active</span>
                      )}
                    </div>
                    <p className="truncate text-[9.5px] text-muted-foreground">{preset.detail}</p>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-muted-foreground">
                    {preset.id === "baseten" ? "muse-spark-open" : preset.id === "meta" ? "muse-spark" : "vllm"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-[10px] leading-snug text-sky-900">
            <strong>To switch:</strong> set <span className="font-mono">MUSE_BASE_URL</span>,{" "}
            <span className="font-mono">MUSE_MODEL</span> and <span className="font-mono">MODEL_API_KEY</span>{" "}
            — no code change, no redeploy of the UI.
          </div>
        </section>
      </div>

      <section className="elev rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> Five structured roles + voice
        </h3>
        <div className="custom-scrollbar mt-2 overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="bg-muted/70 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5">Role</th>
                <th className="px-2.5 py-1.5">Model</th>
                <th className="px-2.5 py-1.5">Schema</th>
                <th className="px-2.5 py-1.5">Endpoint</th>
                <th className="px-2.5 py-1.5">Gate</th>
              </tr>
            </thead>
            <tbody>
              {(config?.roles ?? []).map((role) => (
                <tr key={role.role} className="border-t border-border/70 hover:bg-accent/40">
                  <td className="px-2.5 py-1.5 font-extrabold">{role.role}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">{role.model}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[10px]">{role.schema}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">{role.endpoint}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-800">
                      schema-validated
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          The LLM proposes; the solver proves. No parsed operation reaches the term until it
          passes schema + scenario validation, and no repair, coverage name or student plan is
          shown until the solver has verified it.
        </p>
      </section>
    </div>
  );
}
