"use client";

// Auth route: the login / register portal used to live at `/`. It moved here so
// the marketing landing page can own the root, and it hands off to the intended
// dashboard destination (or the role home) once a session exists.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginView } from "@/components/views/login";
import { Toast } from "@/components/ui/toast";
import { getStoredUser } from "@/lib/auth";

function LoginPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const destination = next && next.startsWith("/") ? next : "/dashboard";
  const [toast, setToast] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  } | null>(null);

  // A returning user with a live session skips the form.
  useEffect(() => {
    if (getStoredUser()) router.replace(destination);
  }, [router, destination]);

  function showToast(message: string, type: "info" | "success" | "warning" | "error" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  }

  return (
    <>
      <LoginView onLogin={() => router.push(destination)} onToast={showToast} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

export default function LoginRegisterPage() {
  return (
    <Suspense fallback={null}>
      <LoginPortal />
    </Suspense>
  );
}
