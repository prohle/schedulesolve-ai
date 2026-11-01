"use client";

// Auth route: the login / register portal used to live at `/`. It moved here so
// the marketing landing page can own the root, and it hands off to /dashboard
// once a session exists.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginView } from "@/components/views/login";
import { Toast } from "@/components/ui/toast";
import { getStoredUser } from "@/lib/auth";

export default function LoginRegisterPage() {
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  } | null>(null);

  // A returning user with a live session skips the form.
  useEffect(() => {
    if (getStoredUser()) router.replace("/dashboard");
  }, [router]);

  function showToast(message: string, type: "info" | "success" | "warning" | "error" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  }

  return (
    <>
      <LoginView onLogin={() => router.push("/dashboard")} onToast={showToast} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
