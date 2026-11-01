"use client";

// Executive benchmark + constraint-proof modals for the marketing page.

import { Sparkles, ShieldCheck, X } from "lucide-react";
import { PROOF_DETAILS, type ProofKey } from "./data";

export function BenchmarkModal({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close benchmark request"
        onClick={onClose}
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-xs"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Request executive benchmark"
        className="relative w-full max-w-md animate-pop space-y-5 rounded-3xl border border-editorial-border bg-white p-6 text-xs shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-editorial-border pb-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-teal-brand-600" />
            <h3 className="text-base font-black text-navy-900">Request Executive Benchmark</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitted();
          }}
        >
          <div>
            <label htmlFor="benchmark-email" className="mb-1 block font-bold text-slate-800">
              Institutional Email:
            </label>
            <input
              id="benchmark-email"
              type="email"
              required
              defaultValue="provost@university.edu"
              className="w-full rounded-xl border border-editorial-border bg-slate-50 px-3.5 py-2.5 font-bold text-navy-900 focus:outline-none focus:ring-2 focus:ring-teal-brand-500"
            />
          </div>

          <div>
            <label htmlFor="benchmark-institution" className="mb-1 block font-bold text-slate-800">
              Institution Name:
            </label>
            <input
              id="benchmark-institution"
              type="text"
              required
              defaultValue="State University of Technology"
              className="w-full rounded-xl border border-editorial-border bg-slate-50 px-3.5 py-2.5 font-bold text-navy-900 focus:outline-none focus:ring-2 focus:ring-teal-brand-500"
            />
          </div>

          <div>
            <label htmlFor="benchmark-term" className="mb-1 block font-bold text-slate-800">
              Target Term Scope:
            </label>
            <select
              id="benchmark-term"
              className="w-full rounded-xl border border-editorial-border bg-slate-50 px-3.5 py-2.5 font-bold text-navy-900 focus:outline-none focus:ring-2 focus:ring-teal-brand-500"
            >
              <option>Fall 2027 Full Campus Timetable</option>
              <option>Spring 2027 Matrix Audit</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-teal-brand-600 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-teal-brand-700"
          >
            Submit Benchmark Request
          </button>
        </form>
      </div>
    </div>
  );
}

export function ProofModal({
  proof,
  onClose,
}: {
  proof: ProofKey | null;
  onClose: () => void;
}) {
  if (!proof) return null;
  const detail = PROOF_DETAILS[proof];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close proof inspector"
        onClick={onClose}
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-xs"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
        className="relative w-full max-w-xl animate-pop space-y-4 rounded-3xl border border-editorial-border bg-white p-6 text-xs shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-editorial-border pb-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-teal-brand-600" />
            <h3 className="text-base font-black text-navy-900">{detail.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 font-medium leading-relaxed text-slate-700">
          <div className="space-y-1 rounded-xl border border-teal-brand-200 bg-teal-brand-50 p-3 text-[11px] font-bold text-teal-brand-900">
            <div>{detail.formulaLabel}</div>
            <div className="font-normal text-teal-brand-800">{detail.formula}</div>
          </div>
          <p>{detail.note}</p>
        </div>

        <div className="flex justify-end border-t border-editorial-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
