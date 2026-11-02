"use client";

import { cn } from "@/lib/utils";
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "info" | "success" | "warning" | "error";
  onClose: () => void;
}

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const colors = {
  info: "bg-slate-900 text-white ring-white/10",
  success: "bg-emerald-950 text-white ring-emerald-400/20",
  warning: "bg-amber-950 text-white ring-amber-400/20",
  error: "bg-red-950 text-white ring-red-400/20",
};

const iconColors = {
  info: "text-sky-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

export function Toast({ message, type = "info", onClose }: ToastProps) {
  const Icon = icons[type];
  return (
    <div
      className={cn(
        // Above the mobile tab bar; bottom-right sheet on larger screens.
        // Click-through: only the dismiss button captures taps, so the toast
        // can never block the primary action sitting underneath it.
        "pointer-events-none fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[80] animate-pop",
        "sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-sm",
        "flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium shadow-2xl ring-1",
        colors[type]
      )}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconColors[type])} />
      <span className="flex-1 leading-snug">{message}</span>
      <button
        onClick={onClose}
        className="pointer-events-auto -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
